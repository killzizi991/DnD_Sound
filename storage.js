// storage.js
class StorageManager {
    constructor() {
        this.dbName = 'DndSoundboardDB';
        this.dbVersion = 3; // Увеличиваем версию для новых полей
        this.db = null;
        this.initialized = false;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.initialized = true;
                console.log('IndexedDB initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;
                
                // Миграция с версии 1 на версию 2
                if (oldVersion < 1) {
                    // Create folders store
                    if (!db.objectStoreNames.contains('folders')) {
                        const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
                        foldersStore.createIndex('parentId', 'parentId', { unique: false });
                    }

                    // Create sounds store
                    if (!db.objectStoreNames.contains('sounds')) {
                        const soundsStore = db.createObjectStore('sounds', { keyPath: 'id' });
                        soundsStore.createIndex('folderId', 'folderId', { unique: false });
                    }

                    // Create settings store
                    if (!db.objectStoreNames.contains('settings')) {
                        db.createObjectStore('settings', { keyPath: 'key' });
                    }
                }
                
                // Миграция с версии 1 на версию 2: добавление полей color и icon
                if (oldVersion < 2) {
                    const transaction = event.target.transaction;
                    const soundsStore = transaction.objectStore('sounds');
                    
                    // Открываем курсор для обновления существующих записей
                    const request = soundsStore.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const sound = cursor.value;
                            // Добавляем новые поля со значениями по умолчанию
                            sound.color = sound.color || '#6c5ce7';
                            sound.icon = sound.icon || '🎵';
                            cursor.update(sound);
                            cursor.continue();
                        }
                    };
                }
                
                // Миграция с версии 2 на версию 3: добавление полей parentId и order для папок
                if (oldVersion < 3) {
                    const transaction = event.target.transaction;
                    const foldersStore = transaction.objectStore('folders');
                    
                    // Открываем курсор для обновления существующих записей
                    const request = foldersStore.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const folder = cursor.value;
                            // Добавляем новые поля со значениями по умолчанию
                            folder.parentId = folder.parentId || null;
                            folder.order = folder.order || 0;
                            cursor.update(folder);
                            cursor.continue();
                        }
                    };
                }
            };
        });
    }

    async saveFolders(folders) {
        if (!this.initialized) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['folders'], 'readwrite');
            const store = transaction.objectStore('folders');
            
            // Clear existing folders
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                // Save all folders
                const folderArray = Array.from(folders.values());
                let completed = 0;
                
                if (folderArray.length === 0) {
                    resolve();
                    return;
                }
                
                folderArray.forEach(folder => {
                    const request = store.put(folder);
                    request.onsuccess = () => {
                        completed++;
                        if (completed === folderArray.length) {
                            resolve();
                        }
                    };
                    request.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            };
            clearRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async saveSounds(sounds) {
        if (!this.initialized) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sounds'], 'readwrite');
            const store = transaction.objectStore('sounds');
            
            // Clear existing sounds
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
                // Save all sounds
                const soundArray = [];
                sounds.forEach((sound, id) => {
                    const soundData = {
                        id: id,
                        name: sound.name,
                        volume: sound.volume,
                        loop: sound.loop,
                        folderId: sound.folderId,
                        audioData: sound.blob ? this.blobToArrayBuffer(sound.blob) : null,
                        fileName: sound.fileName,
                        color: sound.color || '#6c5ce7',
                        icon: sound.icon || '🎵'
                    };
                    soundArray.push(soundData);
                });
                
                if (soundArray.length === 0) {
                    resolve();
                    return;
                }
                
                let completed = 0;
                soundArray.forEach(sound => {
                    const request = store.put(sound);
                    request.onsuccess = () => {
                        completed++;
                        if (completed === soundArray.length) {
                            resolve();
                        }
                    };
                    request.onerror = (event) => {
                        reject(event.target.error);
                    };
                });
            };
            clearRequest.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async loadFolders() {
        if (!this.initialized) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['folders'], 'readonly');
            const store = transaction.objectStore('folders');
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                const folders = new Map();
                event.target.result.forEach(folder => {
                    folders.set(folder.id, folder);
                });
                resolve(folders);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async loadSounds() {
        if (!this.initialized) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sounds'], 'readonly');
            const store = transaction.objectStore('sounds');
            const request = store.getAll();
            
            request.onsuccess = async (event) => {
                const sounds = new Map();
                const soundDataArray = event.target.result;
                
                for (const soundData of soundDataArray) {
                    let blob = null;
                    if (soundData.audioData) {
                        blob = new Blob([soundData.audioData], { type: 'audio/mpeg' });
                    }
                    
                    sounds.set(soundData.id, {
                        name: soundData.name,
                        volume: soundData.volume || 1.0,
                        loop: soundData.loop || false,
                        folderId: soundData.folderId || 'default',
                        blob: blob,
                        fileName: soundData.fileName,
                        color: soundData.color || '#6c5ce7',
                        icon: soundData.icon || '🎵'
                    });
                }
                
                resolve(sounds);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async saveSetting(key, value) {
        if (!this.initialized) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put({ key, value });
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async loadSetting(key, defaultValue = null) {
        if (!this.initialized) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);
            
            request.onsuccess = (event) => {
                const result = event.target.result;
                resolve(result ? result.value : defaultValue);
            };
            
            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    blobToArrayBuffer(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
        });
    }

    async exportData() {
        const [folders, sounds] = await Promise.all([
            this.loadFolders(),
            this.loadSounds()
        ]);
        
        return {
            version: 3,
            folders: Array.from(folders.values()),
            sounds: Array.from(sounds.entries()).map(([id, sound]) => ({
                id,
                ...sound,
                audioData: sound.blob ? await this.blobToArrayBuffer(sound.blob) : null
            }))
        };
    }

    async importData(data) {
        await Promise.all([
            this.saveFolders(new Map(data.folders.map(f => [f.id, f]))),
            this.saveSounds(new Map(data.sounds.map(s => [s.id, s])))
        ]);
    }

    async clearAll() {
        if (!this.initialized) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['folders', 'sounds', 'settings'], 'readwrite');
            
            const foldersRequest = transaction.objectStore('folders').clear();
            const soundsRequest = transaction.objectStore('sounds').clear();
            const settingsRequest = transaction.objectStore('settings').clear();
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event.target.error);
        });
    }
}
