// public/admin/js/admin.js
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
    
    // Socket.io bağlantısı
    const socket = io(window.location.origin, {
      query: { type: 'admin' }
    });
    
    // Durum değişkenleri
    let questionActive = false;
    
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
    });
    
    socket.on('state-update', (data) => {
      totalAudiences.textContent = data.totalAudiences;
      updateRaisedHandsList(data.raisedHands || []);
      updateQuestionStatus(data.questionActive);
      
      addLogEntry(`Durum güncellendi: ${data.totalAudiences} izleyici, ${(data.raisedHands || []).length} el kaldıran`);
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
    
    // Sayfa yüklendiğinde
    addLogEntry('Admin paneli yüklendi');
  });