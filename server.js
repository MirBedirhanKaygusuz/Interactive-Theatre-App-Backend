// server.js - WebRTC destekli
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// Express uygulaması
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// CORS ayarlarıyla Socket.io
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Ana sayfa
app.get('/', (req, res) => {
  res.send('İnteraktif Tiyatro Sunucusu Çalışıyor');
});

// Admin paneli
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Uygulama durumu
const appState = {
  audiences: {},        // Tüm bağlı izleyiciler
  raisedHands: [],      // El kaldıran izleyiciler
  questionActive: false, // Aktif soru durumu
  broadcasts: {},       // Aktif canlı yayınlar
  webrtcPeers: {}       // WebRTC bağlantıları
};

// Detaylı loglama için yardımcı fonksiyon
const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
};

// Socket bağlantılarını yönet
io.on('connection', (socket) => {
  log(`Yeni bağlantı: ${socket.id}`);
  
  // Admin odası
  if (socket.handshake.query && socket.handshake.query.type === 'admin') {
    socket.join('admin');
    log('Admin bağlandı');
    
    // Admin'e mevcut durumu gönder
    socket.emit('state-update', {
      totalAudiences: Object.keys(appState.audiences).length,
      raisedHands: appState.raisedHands,
      questionActive: appState.questionActive,
      broadcasts: Object.keys(appState.broadcasts).map(seatNumber => ({
        seatNumber,
        status: appState.broadcasts[seatNumber].status
      }))
    });
  }
  
  // İzleyici kaydı
  socket.on('register-audience', (data) => {
    const { seatNumber } = data;
    
    // Mevcut koltuk numarasını güncelle veya yeni kayıt oluştur
    appState.audiences[socket.id] = { 
      id: socket.id,
      seatNumber, 
      registeredAt: new Date()
    };
    
    log(`İzleyici kaydoldu: ${seatNumber} (${socket.id})`);
    
    // Admin'e güncelleme gönder
    io.to('admin').emit('audience-registered', {
      totalAudiences: Object.keys(appState.audiences).length
    });
  });
  
  // El kaldırma
  socket.on('raise-hand', (data) => {
    if (!appState.questionActive) return;
    
    const audience = appState.audiences[socket.id];
    if (!audience) return;
    
    // Zaten el kaldırmış mı kontrol et
    const alreadyRaised = appState.raisedHands.some(
      hand => hand.id === socket.id
    );
    
    if (!alreadyRaised) {
      // El kaldıranlar listesine ekle
      appState.raisedHands.push({
        ...audience,
        raisedAt: new Date()
      });
      
      log(`El kaldırdı: ${audience.seatNumber} (${socket.id})`);
      
      // Admin'e güncelleme gönder
      io.to('admin').emit('hand-raised', {
        raisedHands: appState.raisedHands,
        totalRaised: appState.raisedHands.length,
        totalAudiences: Object.keys(appState.audiences).length
      });
    }
  });
  
  // Admin: Soru açma
  socket.on('open-question', () => {
    appState.questionActive = true;
    appState.raisedHands = [];
    
    log('Admin soru açtı');
    
    // Tüm izleyicilere bildir
    io.emit('question-opened');
    
    // Admin'e güncelleme gönder
    io.to('admin').emit('state-update', {
      questionActive: true,
      raisedHands: [],
      totalAudiences: Object.keys(appState.audiences).length
    });
  });
  
  // Admin: Soru kapatma
  socket.on('close-question', () => {
    appState.questionActive = false;
    
    log('Admin soru kapattı');
    
    // Tüm izleyicilere bildir
    io.emit('question-closed');
    
    // Admin'e güncelleme gönder
    io.to('admin').emit('state-update', {
      questionActive: false,
      raisedHands: appState.raisedHands, // Geçmiş olarak sakla
      totalAudiences: Object.keys(appState.audiences).length
    });
  });
  
  // Admin: İzleyici seçme
  socket.on('select-audience', (data) => {
    const { seatNumber } = data;
    
    // Seçilen izleyiciyi bul
    let targetSocketId = null;
    for (const id in appState.audiences) {
      if (appState.audiences[id].seatNumber === seatNumber) {
        targetSocketId = id;
        break;
      }
    }
    
    if (targetSocketId) {
      log(`İzleyici seçildi: ${seatNumber} (${targetSocketId})`);
      
      // Seçilen izleyiciye bildir
      io.to(targetSocketId).emit('selected');
      
      // Admin'e bildir
      io.to('admin').emit('audience-selected', { seatNumber });
      
      // Broadcast kaydı başlat
      appState.broadcasts[seatNumber] = {
        socketId: targetSocketId,
        status: 'waiting',
        startedAt: new Date()
      };
      
      // Admin'e yayın durumunu bildir
      io.to('admin').emit('broadcast-status-update', {
        broadcasts: Object.keys(appState.broadcasts).map(seat => ({
          seatNumber: seat,
          status: appState.broadcasts[seat].status
        }))
      });
    } else {
      log(`Seçilecek izleyici bulunamadı: ${seatNumber}`);
    }
  });
  
  // Admin: Rastgele izleyici seçme
  socket.on('select-random', () => {
    if (appState.raisedHands.length === 0) {
      log('Rastgele seçim: El kaldıran izleyici yok');
      return;
    }
    
    // Rastgele bir indeks seç
    const randomIndex = Math.floor(Math.random() * appState.raisedHands.length);
    const selected = appState.raisedHands[randomIndex];
    
    log(`Rastgele izleyici seçildi: ${selected.seatNumber} (${selected.id})`);
    
    // Seçilen izleyiciye bildir
    io.to(selected.id).emit('selected');
    
    // Admin'e bildir
    io.to('admin').emit('audience-selected', { seatNumber: selected.seatNumber });
    
    // Broadcast kaydı başlat
    appState.broadcasts[selected.seatNumber] = {
      socketId: selected.id,
      status: 'waiting',
      startedAt: new Date()
    };
    
    // Admin'e yayın durumunu bildir
    io.to('admin').emit('broadcast-status-update', {
      broadcasts: Object.keys(appState.broadcasts).map(seat => ({
        seatNumber: seat,
        status: appState.broadcasts[seat].status
      }))
    });
  });
  
  // WebRTC - Offer gönderme (izleyiciden)
  socket.on('rtc-offer', (data) => {
    const { seatNumber, offer } = data;
    
    log(`WebRTC offer alındı: ${seatNumber}`);
    
    // Broadcast durumunu güncelle
    if (appState.broadcasts[seatNumber]) {
      appState.broadcasts[seatNumber].status = 'live';
      appState.broadcasts[seatNumber].offer = offer;
      
      // Admin'e offer'ı gönder
      io.to('admin').emit('rtc-offer', {
        seatNumber,
        offer
      });
      
      // Admin'e yayın durumunu bildir
      io.to('admin').emit('broadcast-status-update', {
        broadcasts: Object.keys(appState.broadcasts).map(seat => ({
          seatNumber: seat,
          status: appState.broadcasts[seat].status
        }))
      });
    }
  });
  
  // WebRTC - Answer gönderme (admin'den)
  socket.on('rtc-answer', (data) => {
    const { seatNumber, answer } = data;
    
    log(`WebRTC answer alındı (admin): ${seatNumber}`);
    
    // Answer'ı izleyiciye ilet
    if (appState.broadcasts[seatNumber]) {
      const targetSocketId = appState.broadcasts[seatNumber].socketId;
      io.to(targetSocketId).emit('rtc-answer', { answer });
    }
  });
  
  // WebRTC - ICE Candidate gönderme
  socket.on('rtc-ice-candidate', (data) => {
    const { seatNumber, candidate } = data;
    
    // Admin'den geliyorsa, izleyiciye ilet
    if (socket.handshake.query && socket.handshake.query.type === 'admin') {
      if (appState.broadcasts[seatNumber]) {
        const targetSocketId = appState.broadcasts[seatNumber].socketId;
        io.to(targetSocketId).emit('rtc-ice-candidate', { candidate });
      }
    } 
    // İzleyiciden geliyorsa, admin'e ilet
    else {
      const audience = appState.audiences[socket.id];
      if (audience) {
        io.to('admin').emit('rtc-ice-candidate', {
          seatNumber: audience.seatNumber,
          candidate
        });
      }
    }
  });
  
  // Yayını durdurma
  socket.on('stop-broadcasting', (data) => {
    const { seatNumber } = data;
    
    log(`Yayın durduruldu: ${seatNumber}`);
    
    // Broadcast kaydını sil
    if (appState.broadcasts[seatNumber]) {
      delete appState.broadcasts[seatNumber];
      
      // Admin'e yayın durumunu bildir
      io.to('admin').emit('broadcast-status-update', {
        broadcasts: Object.keys(appState.broadcasts).map(seat => ({
          seatNumber: seat,
          status: appState.broadcasts[seat].status
        }))
      });
    }
  });
  
  // Admin: Yayını durdurma isteği
  socket.on('admin-stop-broadcast', (data) => {
    const { seatNumber } = data;
    
    log(`Admin yayını durdurdu: ${seatNumber}`);
    
    // İzleyiciye yayını durdurma isteği gönder
    if (appState.broadcasts[seatNumber]) {
      const targetSocketId = appState.broadcasts[seatNumber].socketId;
      io.to(targetSocketId).emit('stop-broadcasting');
      
      // Broadcast kaydını sil
      delete appState.broadcasts[seatNumber];
      
      // Admin'e yayın durumunu bildir
      io.to('admin').emit('broadcast-status-update', {
        broadcasts: Object.keys(appState.broadcasts).map(seat => ({
          seatNumber: seat,
          status: appState.broadcasts[seat].status
        }))
      });
    }
  });
  
  // Bağlantı kesildiğinde
  socket.on('disconnect', () => {
    // Bu bir izleyici miydi?
    if (appState.audiences[socket.id]) {
      const audience = appState.audiences[socket.id];
      log(`İzleyici ayrıldı: ${audience.seatNumber} (${socket.id})`);
      
      // Listeden çıkar
      delete appState.audiences[socket.id];
      
      // El kaldıranlar listesinden de çıkar
      appState.raisedHands = appState.raisedHands.filter(
        hand => hand.id !== socket.id
      );
      
      // Eğer bu izleyicinin aktif bir yayını varsa, onu da kaldır
      const broadcastSeatNumber = Object.keys(appState.broadcasts).find(
        seat => appState.broadcasts[seat].socketId === socket.id
      );
      
      if (broadcastSeatNumber) {
        delete appState.broadcasts[broadcastSeatNumber];
        
        // Admin'e yayın durumunu bildir
        io.to('admin').emit('broadcast-status-update', {
          broadcasts: Object.keys(appState.broadcasts).map(seat => ({
            seatNumber: seat,
            status: appState.broadcasts[seat].status
          }))
        });
      }
      
      // Admin'e güncelleme gönder
      io.to('admin').emit('state-update', {
        totalAudiences: Object.keys(appState.audiences).length,
        raisedHands: appState.raisedHands
      });
    } else {
      log(`Bağlantı kesildi: ${socket.id}`);
    }
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  log(`Sunucu başlatıldı: http://localhost:${PORT}`);
  log(`Admin panel: http://localhost:${PORT}/admin`);
});

// Kapatma sinyallerini yakala
process.on('SIGINT', () => {
  log('Sunucu kapatılıyor...');
  process.exit(0);
});