// public/admin/js/admin.js - WebRTC Destekli
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elementleri
    const connectionStatus = document.getElementById('connection-status');
    const totalAudiences = document.getElementById('total-audiences');
    const raisedHandsList = document.getElementById('raised-hands-list');
    const questionStatusText = document.getElementById('question-status');
    const openQuestionBtn = document.getElementById('open-question-btn');
    const closeQuestionBtn = document.getElementById('close-question-btn');
    const selectRandomBtn = document.getElementById('select-random-btn');
    const activityLog = document.getElementById('activity-log');
    
    // Video ve yayın elementleri
    const remoteVideo = document.getElementById('remote-video');
    const nobroadcastEl = document.getElementById('no-broadcast');
    const broadcastStatus = document.getElementById('broadcast-status');
    const broadcastSeat = document.getElementById('broadcast-seat');
    const stopBroadcastBtn = document.getElementById('stop-broadcast-btn');
    
    // WebRTC bileşenleri
    let peerConnection = null;
    let currentBroadcastSeat = null;
    
    // Socket.io bağlantısı
    const socket = io(window.location.origin, {
      query: { type: 'admin' }
    });
    
    // Durum değişkenleri
    let questionActive = false;
    
    // WebRTC yapılandırma
    const rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    // WebRTC PeerConnection oluştur
    const createPeerConnection = () => {
      if (peerConnection) {
        peerConnection.close();
      }
      
      peerConnection = new RTCPeerConnection(rtcConfig);
      
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && currentBroadcastSeat) {
          socket.emit('rtc-ice-candidate', {
            seatNumber: currentBroadcastSeat,
            candidate: event.candidate
          });
        }
      };
      
      peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
          remoteVideo.srcObject = event.streams[0];
          addLogEntry(`${currentBroadcastSeat} - Video akışı alındı`);
          
          // Yayın başladı - arayüzü güncelle
          nobroadcastEl.style.display = 'none';
          remoteVideo.style.display = 'block';
          broadcastStatus.textContent = 'Canlı Yayında';
          broadcastStatus.classList.add('live');
          stopBroadcastBtn.disabled = false;
        }
      };
      
      peerConnection.oniceconnectionstatechange = () => {
        addLogEntry(`ICE Bağlantı Durumu: ${peerConnection.iceConnectionState}`);
        
        if (peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'failed' || 
            peerConnection.iceConnectionState === 'closed') {
          stopBroadcast();
        }
      };
      
      return peerConnection;
    };
    
    // Yayını durdur
    const stopBroadcast = () => {
      if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
      }
      
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      
      // Arayüzü güncelle
      nobroadcastEl.style.display = 'flex';
      remoteVideo.style.display = 'none';
      broadcastStatus.textContent = 'Yayın bekleniyor';
      broadcastStatus.classList.remove('live');
      broadcastSeat.textContent = '';
      stopBroadcastBtn.disabled = true;
      
      // Sunucuya bildir
      if (currentBroadcastSeat) {
        socket.emit('admin-stop-broadcast', { seatNumber: currentBroadcastSeat });
        addLogEntry(`${currentBroadcastSeat} - Yayın durduruldu`);
        currentBroadcastSeat = null;
      }
    };
    
    // Aktivite logu ekle
    const addLogEntry = (message) => {
      const timestamp = new Date().toLocaleTimeString();
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      entry.innerHTML = `<span class="log-time">${timestamp}</span> ${message}`;
      
      activityLog.prepend(entry);
      
      // En fazla 100 log göster
      if (activityLog.children.length > 100) {
        activityLog.removeChild(activityLog.lastChild);
      }
    };
    
    // El kaldıranlar listesini güncelle
    const updateRaisedHandsList = (hands) => {
      raisedHandsList.innerHTML = '';
      
      if (hands.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'empty-list';
        emptyItem.textContent = 'Henüz el kaldıran yok';
        raisedHandsList.appendChild(emptyItem);
        return;
      }
      
      // Her el kaldıran için liste öğesi oluştur
      hands.forEach(audience => {
        const item = document.createElement('div');
        item.className = 'audience-item';
        
        // Koltuk numarası ve zaman
        const seatInfo = document.createElement('div');
        seatInfo.className = 'seat-info';
        seatInfo.textContent = audience.seatNumber;
        
        const timeInfo = document.createElement('div');
        timeInfo.className = 'time-info';
        const raisedTime = new Date(audience.raisedAt);
        timeInfo.textContent = raisedTime.toLocaleTimeString();
        
        // Seçim butonu
        const selectBtn = document.createElement('button');
        selectBtn.className = 'select-btn';
        selectBtn.textContent = 'Seç';
        selectBtn.addEventListener('click', () => {
          socket.emit('select-audience', { seatNumber: audience.seatNumber });
        });
        
        // Öğeleri birleştir
        item.appendChild(seatInfo);
        item.appendChild(timeInfo);
        item.appendChild(selectBtn);
        
        raisedHandsList.appendChild(item);
      });
    };
    
    // Soru durumunu güncelle
    const updateQuestionStatus = (isActive) => {
      questionActive = isActive;
      
      if (isActive) {
        questionStatusText.textContent = 'Aktif';
        questionStatusText.className = 'status-active';
        openQuestionBtn.disabled = true;
        closeQuestionBtn.disabled = false;
        selectRandomBtn.disabled = false;
      } else {
        questionStatusText.textContent = 'Kapalı';
        questionStatusText.className = 'status-inactive';
        openQuestionBtn.disabled = false;
        closeQuestionBtn.disabled = true;
        selectRandomBtn.disabled = true;
      }
    };
    
    // Socket olayları
    socket.on('connect', () => {
      connectionStatus.textContent = 'Bağlı';
      connectionStatus.className = 'status-connected';
      addLogEntry('Sunucuya bağlanıldı');
    });
    
    socket.on('disconnect', () => {
      connectionStatus.textContent = 'Bağlantı Kesildi';
      connectionStatus.className = 'status-disconnected';
      addLogEntry('Sunucu bağlantısı kesildi');
      stopBroadcast();
    });
    
    socket.on('state-update', (data) => {
      totalAudiences.textContent = data.totalAudiences;
      updateRaisedHandsList(data.raisedHands || []);
      updateQuestionStatus(data.questionActive);
      
      addLogEntry(`Durum güncellendi: ${data.totalAudiences} izleyici, ${(data.raisedHands || []).length} el kaldıran`);
      
      // Aktif yayınları güncelle
      if (data.broadcasts && data.broadcasts.length > 0) {
        const activeBroadcast = data.broadcasts[0]; // Şimdilik tek yayını destekleyelim
        
        currentBroadcastSeat = activeBroadcast.seatNumber;
        broadcastSeat.textContent = `Koltuk: ${activeBroadcast.seatNumber}`;
        
        if (activeBroadcast.status === 'live') {
          broadcastStatus.textContent = 'Canlı Yayında';
          broadcastStatus.classList.add('live');
          stopBroadcastBtn.disabled = false;
        } else {
          broadcastStatus.textContent = 'Yayın bekleniyor';
          broadcastStatus.classList.remove('live');
        }
      }
    });
    
    socket.on('audience-registered', (data) => {
      totalAudiences.textContent = data.totalAudiences;
      addLogEntry(`Yeni izleyici kaydoldu. Toplam: ${data.totalAudiences}`);
    });
    
    socket.on('hand-raised', (data) => {
      totalAudiences.textContent = data.totalAudiences;
      updateRaisedHandsList(data.raisedHands || []);
      
      if (data.raisedHands && data.raisedHands.length > 0) {
        const latest = data.raisedHands[data.raisedHands.length - 1];
        addLogEntry(`Yeni el kaldıran: ${latest.seatNumber}`);
      }
    });
    
    socket.on('audience-selected', (data) => {
      addLogEntry(`${data.seatNumber} numaralı izleyici seçildi`);
      
      // Yayın arayüzünü hazırla
      currentBroadcastSeat = data.seatNumber;
      broadcastSeat.textContent = `Koltuk: ${data.seatNumber}`;
      broadcastStatus.textContent = 'Yayın bekleniyor';
      broadcastStatus.classList.remove('live');
      stopBroadcastBtn.disabled = false;
    });
    
    // WebRTC olayları
    socket.on('rtc-offer', (data) => {
      const { seatNumber, offer } = data;
      
      addLogEntry(`${seatNumber} - Offer alındı`);
      
      // PeerConnection oluştur ve offer'ı set et
      createPeerConnection();
      
      peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
          // Answer'ı gönder
          socket.emit('rtc-answer', {
            seatNumber,
            answer: peerConnection.localDescription
          });
          
          addLogEntry(`${seatNumber} - Answer gönderildi`);
        })
        .catch(error => {
          console.error('WebRTC answer oluşturma hatası:', error);
          addLogEntry(`${seatNumber} - WebRTC hatası: ${error.message}`);
        });
    });
    
    socket.on('rtc-ice-candidate', (data) => {
      const { seatNumber, candidate } = data;
      
      if (peerConnection && candidate) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          .catch(error => {
            console.error('ICE candidate hatası:', error);
            addLogEntry(`${seatNumber} - ICE hatası: ${error.message}`);
          });
      }
    });
    
    socket.on('broadcast-status-update', (data) => {
      if (data.broadcasts && data.broadcasts.length > 0) {
        // Şimdilik tek yayına odaklanalım
        const broadcast = data.broadcasts[0];
        
        if (broadcast.status === 'live') {
          broadcastStatus.textContent = 'Canlı Yayında';
          broadcastStatus.classList.add('live');
        } else {
          broadcastStatus.textContent = 'Yayın bekleniyor';
          broadcastStatus.classList.remove('live');
        }
      } else {
        // Aktif yayın yok
        stopBroadcast();
      }
    });
    
    // Buton olayları
    openQuestionBtn.addEventListener('click', () => {
      socket.emit('open-question');
      addLogEntry('Soru açılıyor...');
    });
    
    closeQuestionBtn.addEventListener('click', () => {
      socket.emit('close-question');
      addLogEntry('Soru kapatılıyor...');
    });
    
    selectRandomBtn.addEventListener('click', () => {
      socket.emit('select-random');
      addLogEntry('Rastgele izleyici seçiliyor...');
    });
    
    stopBroadcastBtn.addEventListener('click', () => {
      stopBroadcast();
    });
    
    // Sayfa yüklendiğinde
    addLogEntry('Admin paneli yüklendi');
    
    // Başlangıçta yayın arayüzünü ayarla
    nobroadcastEl.style.display = 'flex';
    remoteVideo.style.display = 'none';
  });