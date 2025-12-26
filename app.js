// app.js
class AudioEngine {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = new Map();
        this.activeSources = new Map();
        this.masterVolume = 1.0;
        this.folders = new Map();
        this.nextFolderId = 1;
        this.storageManager = new StorageManager();
        this.initDefaultFolders();
        this.initStorage();
    }

    async initStorage() {
        try {
            await this.storageManager.init();
            await this.loadFromStorage();
            console.log('Data loaded from IndexedDB');
        } catch (error) {
            console.error('Failed to load from storage:', error);
        }
    }

    async loadFromStorage() {
        try {
            const [folders, sounds] = await Promise.all([
                this.storageManager.loadFolders(),
                this.storageManager.loadSounds()
            ]);

            // Load folders
            folders.forEach((folder, id) => {
                this.folders.set(id, folder);
                this.nextFolderId = Math.max(this.nextFolderId, parseInt(id.split('_')[1]) || 0) + 1;
            });

            // Load sounds
            for (const [id, soundData] of sounds) {
                if (soundData.blob) {
                    await this.loadSoundFromBlob(id, soundData.blob, soundData.name, 
                                               soundData.folderId, soundData.volume, soundData.loop);
                }
            }
        } catch (error) {
            console.error('Error loading from storage:', error);
        }
    }

    async saveToStorage() {
        try {
            await Promise.all([
                this.storageManager.saveFolders(this.folders),
                this.storageManager.saveSounds(this.sounds)
            ]);
        } catch (error) {
            console.error('Error saving to storage:', error);
        }
    }

    async saveSoundSettings(soundId) {
        const sound = this.sounds.get(soundId);
        if (sound) {
            // Individual sound settings are saved in the sounds store
            await this.saveToStorage();
        }
    }

    initDefaultFolders() {
        this.folders.set('default', {
            id: 'default',
            name: 'Все звуки',
            color: '#6c5ce7',
            icon: '📁'
        });
    }

    async loadSound(id, file, folderId = 'default') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.sounds.set(id, {
                buffer: audioBuffer,
                name: file.name,
                volume: 1.0,
                loop: false,
                folderId: folderId,
                blob: file,
                fileName: file.name
            });
            
            await this.saveToStorage();
            return true;
        } catch (error) {
            console.error('Ошибка загрузки звука:', error);
            return false;
        }
    }

    async loadSoundFromBlob(id, blob, name, folderId = 'default', volume = 1.0, loop = false) {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.sounds.set(id, {
                buffer: audioBuffer,
                name: name,
                volume: volume,
                loop: loop,
                folderId: folderId,
                blob: blob,
                fileName: name
            });
            
            return true;
        } catch (error) {
            console.error('Ошибка загрузки звука из Blob:', error);
            return false;
        }
    }

    playSound(id) {
        if (!this.sounds.has(id)) return null;
        
        const sound = this.sounds.get(id);
        const source = this.audioContext.createBufferSource();
        const gainNode = this.audioContext.createGain();
        
        source.buffer = sound.buffer;
        source.loop = sound.loop;
        
        gainNode.gain.value = sound.volume * this.masterVolume;
        
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        source.start();
        
        const sourceId = Date.now() + Math.random();
        this.activeSources.set(sourceId, {
            source,
            gainNode,
            soundId: id,
            paused: false,
            startTime: this.audioContext.currentTime,
            pausedTime: 0,
            folderId: sound.folderId
        });
        
        if (!sound.loop) {
            source.onended = () => {
                this.activeSources.delete(sourceId);
                updateActiveCount();
            };
        }
        
        updateActiveCount();
        return sourceId;
    }

    stopSound(sourceId) {
        const activeSound = this.activeSources.get(sourceId);
        if (activeSound) {
            try {
                activeSound.source.stop();
            } catch (e) {}
            this.activeSources.delete(sourceId);
            updateActiveCount();
        }
    }

    pauseSound(sourceId) {
        const activeSound = this.activeSources.get(sourceId);
        if (activeSound && !activeSound.paused) {
            activeSound.paused = true;
            activeSound.pausedTime = this.audioContext.currentTime - activeSound.startTime;
            activeSound.source.stop();
        }
    }

    resumeSound(sourceId) {
        const activeSound = this.activeSources.get(sourceId);
        if (activeSound && activeSound.paused) {
            const sound = this.sounds.get(activeSound.soundId);
            const newSource = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            newSource.buffer = sound.buffer;
            newSource.loop = sound.loop;
            
            gainNode.gain.value = sound.volume * this.masterVolume;
            
            newSource.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            newSource.start(0, activeSound.pausedTime % sound.buffer.duration);
            
            activeSound.source = newSource;
            activeSound.gainNode = gainNode;
            activeSound.paused = false;
            activeSound.startTime = this.audioContext.currentTime - activeSound.pausedTime;
            
            if (!sound.loop) {
                newSource.onended = () => {
                    this.activeSources.delete(sourceId);
                    updateActiveCount();
                };
            }
        }
    }

    setVolume(sourceId, volume) {
        const activeSound = this.activeSources.get(sourceId);
        if (activeSound) {
            const sound = this.sounds.get(activeSound.soundId);
            sound.volume = volume;
            if (activeSound.gainNode) {
                activeSound.gainNode.gain.value = volume * this.masterVolume;
            }
            this.saveSoundSettings(activeSound.soundId);
        }
    }

    async setLoop(id, loop) {
        if (this.sounds.has(id)) {
            const sound = this.sounds.get(id);
            sound.loop = loop;
            
            this.activeSources.forEach((activeSound, sourceId) => {
                if (activeSound.soundId === id && activeSound.source) {
                    activeSound.source.loop = loop;
                }
            });
            
            await this.saveSoundSettings(id);
            return true;
        }
        return false;
    }

    async createFolder(name, color = '#6c5ce7', icon = '📁') {
        const folderId = `folder_${this.nextFolderId++}`;
        this.folders.set(folderId, {
            id: folderId,
            name: name,
            color: color,
            icon: icon
        });
        
        await this.saveToStorage();
        return folderId;
    }

    async updateFolder(folderId, updates) {
        if (this.folders.has(folderId)) {
            const folder = this.folders.get(folderId);
            Object.assign(folder, updates);
            await this.saveToStorage();
            return true;
        }
        return false;
    }

    async deleteFolder(folderId) {
        if (folderId === 'default') return false;
        
        this.folders.delete(folderId);
        
        this.sounds.forEach((sound, soundId) => {
            if (sound.folderId === folderId) {
                sound.folderId = 'default';
            }
        });
        
        await this.saveToStorage();
        return true;
    }

    getSoundsByFolder(folderId) {
        const folderSounds = [];
        this.sounds.forEach((sound, soundId) => {
            if (sound.folderId === folderId) {
                folderSounds.push({
                    id: soundId,
                    ...sound
                });
            }
        });
        return folderSounds;
    }

    getActiveSoundsByFolder(folderId) {
        const activeFolderSounds = [];
        this.activeSources.forEach((activeSound, sourceId) => {
            if (activeSound.folderId === folderId) {
                activeFolderSounds.push({
                    sourceId: sourceId,
                    ...activeSound
                });
            }
        });
        return activeFolderSounds;
    }

    stopAll() {
        this.activeSources.forEach((_, sourceId) => {
            this.stopSound(sourceId);
        });
    }

    pauseAll() {
        this.activeSources.forEach((activeSound, sourceId) => {
            if (!activeSound.paused) {
                this.pauseSound(sourceId);
            }
        });
    }

    resumeAll() {
        this.activeSources.forEach((activeSound, sourceId) => {
            if (activeSound.paused) {
                this.resumeSound(sourceId);
            }
        });
    }

    syncAll() {
        const currentTime = this.audioContext.currentTime;
        this.activeSources.forEach((activeSound, sourceId) => {
            this.stopSound(sourceId);
            setTimeout(() => {
                this.playSound(activeSound.soundId);
            }, 100);
        });
    }

    getActiveCount() {
        return this.activeSources.size;
    }

    resumeAudioContext() {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    async exportData() {
        return await this.storageManager.exportData();
    }

    async importData(data) {
        await this.storageManager.importData(data);
        await this.loadFromStorage();
    }

    async clearAllData() {
        await this.storageManager.clearAll();
        this.sounds.clear();
        this.folders.clear();
        this.initDefaultFolders();
        this.nextFolderId = 1;
    }
}

class SoundboardApp {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.loadedSounds = new Map();
        this.activeSounds = new Map();
        this.soundCounter = 0;
        this.selectedFolder = 'default';
        this.editMode = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderFolderPanel();
        this.renderSoundboard();
        this.checkAudioContext();
    }

    bindEvents() {
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadTracks());
        document.getElementById('syncAll').addEventListener('click', () => this.audioEngine.syncAll());
        document.getElementById('pauseAll').addEventListener('click', () => this.togglePauseAll());
        document.getElementById('stopAll').addEventListener('click', () => this.stopAll());
        document.getElementById('addFolderBtn').addEventListener('click', () => this.showAddFolderDialog());
        document.getElementById('toggleEditBtn').addEventListener('click', () => this.toggleEditMode());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importBtn').addEventListener('click', () => this.importData());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAllData());
        
        document.addEventListener('click', () => {
            this.audioEngine.resumeAudioContext();
        });
    }

    async uploadTracks() {
        const fileInput = document.querySelector('.file-input');
        const files = Array.from(fileInput.files);
        
        if (files.length === 0) {
            this.updateStatus('Пожалуйста, сначала выберите аудиофайлы');
            return;
        }
        
        document.getElementById('uploadBtn').disabled = true;
        this.updateStatus(`Загрузка ${files.length} трек(ов)...`);
        
        let loadedCount = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const soundId = `sound_${Date.now()}_${this.soundCounter++}`;
            
            const success = await this.audioEngine.loadSound(soundId, file, this.selectedFolder);
            if (success) {
                this.loadedSounds.set(soundId, {
                    id: soundId,
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    file: file,
                    folderId: this.selectedFolder
                });
                loadedCount++;
            }
        }
        
        this.updateStatus(`Успешно загружено ${loadedCount} трек(ов)`);
        document.getElementById('uploadBtn').disabled = false;
        this.renderSoundboard();
        
        fileInput.value = '';
    }

    playSound(soundId) {
        if (this.activeSounds.has(soundId)) {
            this.stopSound(soundId);
        } else {
            const sourceId = this.audioEngine.playSound(soundId);
            if (sourceId) {
                this.activeSounds.set(soundId, sourceId);
                this.updateSoundCard(soundId, true);
            }
        }
        updateActiveCount();
    }

    stopSound(soundId) {
        const sourceId = this.activeSounds.get(soundId);
        if (sourceId) {
            this.audioEngine.stopSound(sourceId);
            this.activeSounds.delete(soundId);
            this.updateSoundCard(soundId, false);
        }
        updateActiveCount();
    }

    togglePauseAll() {
        const pauseBtn = document.getElementById('pauseAll');
        const isPaused = pauseBtn.textContent.includes('Возобновить');
        
        if (isPaused) {
            this.audioEngine.resumeAll();
            pauseBtn.textContent = 'Пауза всех';
            this.updateStatus('Возобновлено воспроизведение всех треков');
        } else {
            this.audioEngine.pauseAll();
            pauseBtn.textContent = 'Возобновить все';
            this.updateStatus('Пауза всех треков');
        }
    }

    stopAll() {
        this.audioEngine.stopAll();
        this.activeSounds.clear();
        this.renderSoundboard();
        this.updateStatus('Остановка всех треков');
        document.getElementById('pauseAll').textContent = 'Пауза всех';
        updateActiveCount();
    }

    updateVolume(soundId, volume) {
        const sourceId = this.activeSounds.get(soundId);
        if (sourceId) {
            this.audioEngine.setVolume(sourceId, volume);
        }
    }

    async toggleLoop(soundId) {
        const sound = this.audioEngine.sounds.get(soundId);
        if (sound) {
            const newLoopState = !sound.loop;
            await this.audioEngine.setLoop(soundId, newLoopState);
            this.updateLoopButton(soundId, newLoopState);
            return newLoopState;
        }
        return false;
    }

    showAddFolderDialog() {
        const folderName = prompt('Введите название новой папки:', 'Новая папка');
        if (folderName && folderName.trim()) {
            this.audioEngine.createFolder(folderName.trim());
            this.updateStatus(`Создана папка "${folderName}"`);
            this.renderFolderPanel();
        }
    }

    selectFolder(folderId) {
        this.selectedFolder = folderId;
        this.renderFolderPanel();
        this.renderSoundboard();
        
        const folder = this.audioEngine.folders.get(folderId);
        if (folder) {
            this.updateStatus(`Выбрана папка: ${folder.name}`);
        }
    }

    toggleEditMode() {
        this.editMode = !this.editMode;
        const editBtn = document.getElementById('toggleEditBtn');
        
        if (this.editMode) {
            editBtn.textContent = 'Завершить редактирование';
            editBtn.classList.add('active');
            this.updateStatus('Режим редактирования включен');
        } else {
            editBtn.textContent = 'Режим редактирования';
            editBtn.classList.remove('active');
            this.updateStatus('Режим редактирования выключен');
        }
        
        this.renderSoundboard();
    }

    renderFolderPanel() {
        const folderPanel = document.getElementById('folderPanel');
        folderPanel.innerHTML = '';
        
        this.audioEngine.folders.forEach((folder, folderId) => {
            const folderElement = document.createElement('div');
            folderElement.className = `folder-item ${this.selectedFolder === folderId ? 'active' : ''}`;
            folderElement.style.borderLeftColor = folder.color;
            folderElement.innerHTML = `
                <div class="folder-icon">${folder.icon}</div>
                <div class="folder-name">${folder.name}</div>
                <div class="folder-count">${this.audioEngine.getSoundsByFolder(folderId).length}</div>
            `;
            
            folderElement.addEventListener('click', () => {
                this.selectFolder(folderId);
            });
            
            folderPanel.appendChild(folderElement);
        });
    }

    renderSoundboard() {
        const soundboard = document.getElementById('soundboard');
        soundboard.innerHTML = '';
        
        const folderSounds = this.audioEngine.getSoundsByFolder(this.selectedFolder);
        
        if (folderSounds.length === 0) {
            const emptyCard = document.createElement('div');
            emptyCard.className = 'sound-card empty';
            emptyCard.innerHTML = `
                <div class="sound-icon">🎵</div>
                <div class="sound-name">${this.selectedFolder === 'default' ? 'Нет загруженных треков' : 'Папка пуста'}</div>
                <div class="sound-controls">
                    <button class="play-btn" disabled>Воспроизвести</button>
                    <button class="stop-btn" disabled>Остановить</button>
                </div>
            `;
            soundboard.appendChild(emptyCard);
            return;
        }
        
        folderSounds.forEach((sound) => {
            const soundId = sound.id;
            const isActive = this.activeSounds.has(soundId);
            const isLoop = sound.loop;
            
            const soundCard = document.createElement('div');
            soundCard.className = `sound-card ${isActive ? 'active' : ''}`;
            soundCard.innerHTML = `
                ${this.editMode ? '<button class="delete-btn" data-sound="${soundId}">🗑️</button>' : ''}
                <div class="sound-icon">${this.getSoundEmoji(sound.name)}</div>
                <div class="sound-name">${sound.name}</div>
                <div class="sound-settings">
                    <div class="volume-control">
                        <span>🔈</span>
                        <input type="range" class="volume-slider" min="0" max="1" step="0.1" value="${sound.volume}">
                    </div>
                    <button class="loop-btn ${isLoop ? 'active' : ''}" data-sound="${soundId}">
                        ${isLoop ? '🔂' : '🔁'}
                    </button>
                </div>
                <div class="sound-controls">
                    <button class="play-btn ${isActive ? 'playing' : ''}" data-sound="${soundId}">
                        ${isActive ? '⏸️' : '▶️'}
                    </button>
                    <button class="stop-btn" data-sound="${soundId}">⏹️</button>
                </div>
            `;
            
            const playBtn = soundCard.querySelector('.play-btn');
            const stopBtn = soundCard.querySelector('.stop-btn');
            const volumeSlider = soundCard.querySelector('.volume-slider');
            const loopBtn = soundCard.querySelector('.loop-btn');
            const deleteBtn = soundCard.querySelector('.delete-btn');
            
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.audioEngine.resumeAudioContext();
                this.playSound(soundId);
            });
            
            stopBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.stopSound(soundId);
            });
            
            volumeSlider.addEventListener('input', (e) => {
                const volume = parseFloat(e.target.value);
                this.updateVolume(soundId, volume);
            });
            
            loopBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newLoopState = await this.toggleLoop(soundId);
                loopBtn.classList.toggle('active', newLoopState);
                loopBtn.innerHTML = newLoopState ? '🔂' : '🔁';
            });
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('Удалить этот звук?')) {
                        this.deleteSound(soundId);
                    }
                });
            }
            
            soundboard.appendChild(soundCard);
        });
    }

    deleteSound(soundId) {
        this.stopSound(soundId);
        this.audioEngine.sounds.delete(soundId);
        this.loadedSounds.delete(soundId);
        this.audioEngine.saveToStorage();
        this.renderSoundboard();
        this.updateStatus('Звук удален');
    }

    updateSoundCard(soundId, isActive) {
        const card = document.querySelector(`[data-sound="${soundId}"]`)?.closest('.sound-card');
        if (card) {
            card.classList.toggle('active', isActive);
            const playBtn = card.querySelector('.play-btn');
            if (playBtn) {
                playBtn.classList.toggle('playing', isActive);
                playBtn.innerHTML = isActive ? '⏸️' : '▶️';
            }
        }
    }

    updateLoopButton(soundId, isLoop) {
        const card = document.querySelector(`[data-sound="${soundId}"]`)?.closest('.sound-card');
        if (card) {
            const loopBtn = card.querySelector('.loop-btn');
            if (loopBtn) {
                loopBtn.classList.toggle('active', isLoop);
                loopBtn.innerHTML = isLoop ? '🔂' : '🔁';
            }
        }
    }

    getSoundEmoji(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('dragon') || nameLower.includes('fire')) return '🐉';
        if (nameLower.includes('sword') || nameLower.includes('fight')) return '⚔️';
        if (nameLower.includes('magic') || nameLower.includes('spell')) return '✨';
        if (nameLower.includes('forest') || nameLower.includes('nature')) return '🌲';
        if (nameLower.includes('rain') || nameLower.includes('storm')) return '⛈️';
        return '🎵';
    }

    updateStatus(message) {
        const statusEl = document.getElementById('uploadStatus');
        statusEl.textContent = message;
        statusEl.style.animation = 'none';
        setTimeout(() => {
            statusEl.style.animation = 'fadeIn 0.5s';
        }, 10);
    }

    checkAudioContext() {
        document.addEventListener('click', () => {
            if (this.audioEngine.audioContext.state === 'suspended') {
                this.audioEngine.audioContext.resume();
            }
        }, { once: true });
    }

    async exportData() {
        try {
            const data = await this.audioEngine.exportData();
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'dnd-soundboard-backup.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.updateStatus('Данные экспортированы');
        } catch (error) {
            console.error('Export error:', error);
            this.updateStatus('Ошибка при экспорте данных');
        }
    }

    async importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (confirm('Импортировать данные? Существующие данные будут заменены.')) {
                    await this.audioEngine.importData(data);
                    this.renderFolderPanel();
                    this.renderSoundboard();
                    this.updateStatus('Данные импортированы');
                }
            } catch (error) {
                console.error('Import error:', error);
                this.updateStatus('Ошибка при импорте данных');
            }
        };
        
        input.click();
    }

    async clearAllData() {
        if (confirm('Очистить все данные? Это действие нельзя отменить.')) {
            await this.audioEngine.clearAllData();
            this.loadedSounds.clear();
            this.activeSounds.clear();
            this.selectedFolder = 'default';
            this.renderFolderPanel();
            this.renderSoundboard();
            this.updateStatus('Все данные очищены');
        }
    }
}

let app;

function updateActiveCount() {
    const activeCount = app.audioEngine.getActiveCount();
    document.getElementById('activeCount').textContent = activeCount;
}

window.addEventListener('DOMContentLoaded', () => {
    app = new SoundboardApp();
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(error => {
                console.log('Регистрация ServiceWorker не удалась:', error);
            });
        });
    }
});
