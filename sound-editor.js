// sound-editor.js
class SoundEditor {
    constructor(app) {
        this.app = app;
        this.currentSoundId = null;
        this.icons = ['🎵', '🎶', '🎼', '🎤', '🎧', '🎷', '🎸', '🎺', '🎻', '🥁', 
                     '🎮', '⚔️', '🛡️', '🐉', '🧙', '🧝', '🏰', '🌲', '🔥', '💧',
                     '🌟', '✨', '🌙', '☀️', '⛈️', '🌪️', '💨', '🏹', '🗡️', '🔮'];
        this.colors = ['#ff6b6b', '#ff7675', '#fab1a0', '#fd79a8', '#a29bfe', 
                      '#6c5ce7', '#74b9ff', '#0984e3', '#00b894', '#55efc4',
                      '#ffeaa7', '#fdcb6e', '#e17055', '#d63031', '#e84393',
                      '#00cec9', '#81ecec', '#dfe6e9', '#636e72', '#2d3436'];
        this.init();
    }

    init() {
        this.createModal();
        this.bindEvents();
    }

    createModal() {
        const modalHTML = `
            <div class="modal" id="soundEditorModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Редактировать звук</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="soundName">Название:</label>
                            <input type="text" id="soundName" class="form-input" maxlength="30">
                        </div>
                        
                        <div class="form-group">
                            <label for="soundFolder">Папка:</label>
                            <select id="soundFolder" class="form-select"></select>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label>Иконка:</label>
                                <div class="icon-picker" id="iconPicker">
                                    ${this.icons.map(icon => `
                                        <div class="icon-option" data-icon="${icon}">${icon}</div>
                                    `).join('')}
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Цвет кнопки:</label>
                                <div class="color-picker" id="colorPicker">
                                    ${this.colors.map(color => `
                                        <div class="color-option" style="background-color: ${color}" data-color="${color}"></div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="soundVolume">Громкость:</label>
                            <input type="range" id="soundVolume" class="form-slider" min="0" max="1" step="0.1" value="1">
                            <span id="volumeValue">100%</span>
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" id="soundLoop"> Зациклить звук
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label>Заменить аудиофайл:</label>
                            <input type="file" id="replaceAudio" class="form-input" accept="audio/*">
                            <div class="file-info" id="currentFileInfo"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="cancelEdit">Отмена</button>
                        <button class="btn btn-primary" id="saveSound">Сохранить</button>
                        <button class="btn btn-danger" id="cloneSound">Клонировать</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    bindEvents() {
        const modal = document.getElementById('soundEditorModal');
        const closeBtn = modal.querySelector('.modal-close');
        const cancelBtn = modal.querySelector('#cancelEdit');
        const saveBtn = modal.querySelector('#saveSound');
        const cloneBtn = modal.querySelector('#cloneSound');
        const volumeSlider = modal.querySelector('#soundVolume');
        const replaceAudio = modal.querySelector('#replaceAudio');
        
        closeBtn.addEventListener('click', () => this.hide());
        cancelBtn.addEventListener('click', () => this.hide());
        
        saveBtn.addEventListener('click', async () => {
            await this.saveChanges();
            this.hide();
        });
        
        cloneBtn.addEventListener('click', async () => {
            await this.cloneSound();
            this.hide();
        });
        
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            modal.querySelector('#volumeValue').textContent = `${Math.round(volume * 100)}%`;
        });
        
        replaceAudio.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                if (file.size > 10 * 1024 * 1024) {
                    alert('Файл слишком большой. Максимальный размер: 10 МБ');
                    e.target.value = '';
                    return;
                }
                
                const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-wav'];
                if (!validTypes.includes(file.type)) {
                    alert('Неподдерживаемый формат файла. Используйте MP3, WAV или OGG.');
                    e.target.value = '';
                    return;
                }
                
                this.newAudioFile = file;
                modal.querySelector('#currentFileInfo').textContent = `Новый файл: ${file.name}`;
            }
        });
        
        // Icon picker
        modal.querySelectorAll('.icon-option').forEach(icon => {
            icon.addEventListener('click', (e) => {
                modal.querySelectorAll('.icon-option').forEach(i => i.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });
        
        // Color picker
        modal.querySelectorAll('.color-option').forEach(color => {
            color.addEventListener('click', (e) => {
                modal.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hide();
            }
        });
    }

    async show(soundId) {
        this.currentSoundId = soundId;
        const sound = this.app.audioEngine.sounds.get(soundId);
        const modal = document.getElementById('soundEditorModal');
        
        if (!sound) {
            console.error('Sound not found:', soundId);
            return;
        }
        
        // Fill folder selector
        const folderSelect = modal.querySelector('#soundFolder');
        folderSelect.innerHTML = '';
        this.app.audioEngine.folders.forEach((folder, folderId) => {
            const option = document.createElement('option');
            option.value = folderId;
            option.textContent = folder.name;
            if (folderId === sound.folderId) {
                option.selected = true;
            }
            folderSelect.appendChild(option);
        });
        
        // Fill sound data
        modal.querySelector('#soundName').value = sound.name;
        modal.querySelector('#soundVolume').value = sound.volume;
        modal.querySelector('#volumeValue').textContent = `${Math.round(sound.volume * 100)}%`;
        modal.querySelector('#soundLoop').checked = sound.loop;
        modal.querySelector('#currentFileInfo').textContent = `Текущий файл: ${sound.fileName || 'неизвестно'}`;
        
        // Select icon
        const selectedIcon = sound.icon || '🎵';
        modal.querySelectorAll('.icon-option').forEach(icon => {
            icon.classList.toggle('selected', icon.dataset.icon === selectedIcon);
        });
        
        // Select color
        const selectedColor = sound.color || '#6c5ce7';
        modal.querySelectorAll('.color-option').forEach(color => {
            color.classList.toggle('selected', color.dataset.color === selectedColor);
        });
        
        this.newAudioFile = null;
        modal.style.display = 'block';
        modal.querySelector('#soundName').focus();
    }

    hide() {
        const modal = document.getElementById('soundEditorModal');
        modal.style.display = 'none';
        modal.querySelector('#replaceAudio').value = '';
        this.currentSoundId = null;
        this.newAudioFile = null;
    }

    async saveChanges() {
        if (!this.currentSoundId) return;
        
        const modal = document.getElementById('soundEditorModal');
        const sound = this.app.audioEngine.sounds.get(this.currentSoundId);
        
        if (!sound) return;
        
        const updates = {
            name: modal.querySelector('#soundName').value.trim(),
            folderId: modal.querySelector('#soundFolder').value,
            volume: parseFloat(modal.querySelector('#soundVolume').value),
            loop: modal.querySelector('#soundLoop').checked
        };
        
        // Update icon
        const selectedIcon = modal.querySelector('.icon-option.selected');
        if (selectedIcon) {
            updates.icon = selectedIcon.dataset.icon;
        }
        
        // Update color
        const selectedColor = modal.querySelector('.color-option.selected');
        if (selectedColor) {
            updates.color = selectedColor.dataset.color;
        }
        
        // Replace audio file if needed
        if (this.newAudioFile) {
            try {
                // Create new sound ID to replace the old one
                const newSoundId = `sound_${Date.now()}_${this.app.soundCounter++}`;
                
                // Load new audio file
                const success = await this.app.audioEngine.loadSound(
                    newSoundId, 
                    this.newAudioFile, 
                    updates.folderId
                );
                
                if (success) {
                    // Copy metadata from old sound
                    const newSound = this.app.audioEngine.sounds.get(newSoundId);
                    Object.assign(newSound, updates);
                    
                    // Stop and delete old sound
                    this.app.stopSound(this.currentSoundId);
                    this.app.audioEngine.sounds.delete(this.currentSoundId);
                    this.app.loadedSounds.delete(this.currentSoundId);
                    
                    // Update loaded sounds map
                    this.app.loadedSounds.set(newSoundId, {
                        id: newSoundId,
                        name: updates.name,
                        file: this.newAudioFile,
                        folderId: updates.folderId
                    });
                    
                    this.currentSoundId = newSoundId;
                } else {
                    alert('Ошибка при загрузке нового аудиофайла');
                    return;
                }
            } catch (error) {
                console.error('Error replacing audio:', error);
                alert('Ошибка при замене аудиофайла');
                return;
            }
        } else {
            // Just update metadata
            Object.assign(sound, updates);
            
            // Update active sources if any
            this.app.audioEngine.activeSources.forEach((activeSound, sourceId) => {
                if (activeSound.soundId === this.currentSoundId) {
                    // Update volume
                    if (activeSound.gainNode) {
                        activeSound.gainNode.gain.value = updates.volume * this.app.audioEngine.masterVolume;
                    }
                    
                    // Update loop
                    if (activeSound.source) {
                        activeSound.source.loop = updates.loop;
                    }
                    
                    // Update folder
                    activeSound.folderId = updates.folderId;
                }
            });
        }
        
        // Save to storage
        await this.app.audioEngine.saveToStorage();
        
        // Update UI
        this.app.renderSoundboard();
        this.app.updateStatus('Изменения сохранены');
    }

    async cloneSound() {
        if (!this.currentSoundId) return;
        
        const modal = document.getElementById('soundEditorModal');
        const originalSound = this.app.audioEngine.sounds.get(this.currentSoundId);
        
        if (!originalSound) return;
        
        const newSoundId = `sound_${Date.now()}_${this.app.soundCounter++}`;
        const soundName = modal.querySelector('#soundName').value.trim() + ' (копия)';
        const folderId = modal.querySelector('#soundFolder').value;
        
        try {
            // Clone the sound
            if (originalSound.blob) {
                const success = await this.app.audioEngine.loadSoundFromBlob(
                    newSoundId,
                    originalSound.blob,
                    soundName,
                    folderId,
                    parseFloat(modal.querySelector('#soundVolume').value),
                    modal.querySelector('#soundLoop').checked
                );
                
                if (success) {
                    const newSound = this.app.audioEngine.sounds.get(newSoundId);
                    
                    // Copy icon and color
                    const selectedIcon = modal.querySelector('.icon-option.selected');
                    if (selectedIcon) {
                        newSound.icon = selectedIcon.dataset.icon;
                    }
                    
                    const selectedColor = modal.querySelector('.color-option.selected');
                    if (selectedColor) {
                        newSound.color = selectedColor.dataset.color;
                    }
                    
                    // Update loaded sounds
                    this.app.loadedSounds.set(newSoundId, {
                        id: newSoundId,
                        name: soundName,
                        file: originalSound.blob,
                        folderId: folderId
                    });
                    
                    // Save to storage
                    await this.app.audioEngine.saveToStorage();
                    
                    // Update UI
                    this.app.renderSoundboard();
                    this.app.updateStatus('Звук скопирован');
                }
            }
        } catch (error) {
            console.error('Error cloning sound:', error);
            alert('Ошибка при клонировании звука');
        }
    }
}
