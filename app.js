
// app.js
class AudioEngine {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = new Map();
        this.activeSources = new Map();
        this.masterVolume = 1.0;
    }

    async loadSound(id, file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.sounds.set(id, {
                buffer: audioBuffer,
                name: file.name,
                volume: 1.0,
                loop: false
            });
            
            return true;
        } catch (error) {
            console.error('Ошибка загрузки звука:', error);
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
            pausedTime: 0
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
        }
    }

    setLoop(id, loop) {
        if (this.sounds.has(id)) {
            const sound = this.sounds.get(id);
            sound.loop = loop;
            
            // Обновить loop для всех активных источников этого звука
            this.activeSources.forEach((activeSound, sourceId) => {
                if (activeSound.soundId === id && activeSound.source) {
                    activeSound.source.loop = loop;
                }
            });
            
            return true;
        }
        return false;
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
}

class SoundboardApp {
    constructor() {
        this.audioEngine = new AudioEngine();
        this.loadedSounds = new Map();
        this.activeSounds = new Map();
        this.maxSounds = 10;
        this.soundCounter = 0;
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderSoundboard();
        this.checkAudioContext();
    }

    bindEvents() {
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadTracks());
        document.getElementById('syncAll').addEventListener('click', () => this.audioEngine.syncAll());
        document.getElementById('pauseAll').addEventListener('click', () => this.togglePauseAll());
        document.getElementById('stopAll').addEventListener('click', () => this.stopAll());
        
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
            
            const success = await this.audioEngine.loadSound(soundId, file);
            if (success) {
                this.loadedSounds.set(soundId, {
                    id: soundId,
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    file: file
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

    toggleLoop(soundId) {
        const sound = this.audioEngine.sounds.get(soundId);
        if (sound) {
            const newLoopState = !sound.loop;
            this.audioEngine.setLoop(soundId, newLoopState);
            this.updateLoopButton(soundId, newLoopState);
            return newLoopState;
        }
        return false;
    }

    renderSoundboard() {
        const soundboard = document.getElementById('soundboard');
        soundboard.innerHTML = '';
        
        if (this.loadedSounds.size === 0) {
            const emptyCard = document.createElement('div');
            emptyCard.className = 'sound-card';
            emptyCard.innerHTML = `
                <div class="sound-icon">🎵</div>
                <div class="sound-name">Нет загруженных треков</div>
                <div class="sound-controls">
                    <button class="play-btn" disabled>Воспроизвести</button>
                    <button class="stop-btn" disabled>Остановить</button>
                </div>
            `;
            soundboard.appendChild(emptyCard);
            return;
        }
        
        this.loadedSounds.forEach((sound, soundId) => {
            const isActive = this.activeSounds.has(soundId);
            const audioSound = this.audioEngine.sounds.get(soundId);
            const isLoop = audioSound ? audioSound.loop : false;
            
            const soundCard = document.createElement('div');
            soundCard.className = `sound-card ${isActive ? 'active' : ''}`;
            soundCard.innerHTML = `
                <div class="sound-icon">${this.getSoundEmoji(sound.name)}</div>
                <div class="sound-name">${sound.name}</div>
                <div class="sound-settings">
                    <div class="volume-control">
                        <span>🔈</span>
                        <input type="range" class="volume-slider" min="0" max="1" step="0.1" value="1">
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
            
            loopBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newLoopState = this.toggleLoop(soundId);
                loopBtn.classList.toggle('active', newLoopState);
                loopBtn.innerHTML = newLoopState ? '🔂' : '🔁';
            });
            
            soundboard.appendChild(soundCard);
        });
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


