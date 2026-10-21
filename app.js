/**
 * ============================================
 *  FACE RECOGNITION SYSTEM - Frontend Logic
 *  
 *  Features:
 *  - Webcam real-time face detection
 *  - Image upload face detection
 *  - Bounding box overlay with labels
 *  - Real-time results display
 * ============================================
 */

// ─── Configuration ───
// URL Backend Cloud publik (Hugging Face Spaces atau Cloudflare Tunnel)
const CLOUD_BACKEND_URL = 'https://commercial-calculations-indirect-yeast.trycloudflare.com';

const isFileProtocol = window.location.protocol === 'file:';
const isLocal = Boolean(
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === '' ||
    isFileProtocol
);

let defaultApi = 'http://localhost:5000';
if (!isLocal) {
    defaultApi = CLOUD_BACKEND_URL;
} else if (!isFileProtocol && window.location.origin && window.location.origin !== 'null') {
    defaultApi = window.location.origin;
} else {
    defaultApi = 'http://localhost:5000';
}

const customApi = localStorage.getItem('faceid_backend_url');
let API_BASE = (customApi ? customApi.replace(/\/$/, '') : defaultApi);
const WEBCAM_INTERVAL_MS = 1500;  // Kirim frame setiap 1.5 detik
const JPEG_QUALITY = 0.85;

function configureServerUrl() {
    const current = localStorage.getItem('faceid_backend_url') || API_BASE;
    const input = prompt(
        "Pengaturan URL Backend Server API:\n" +
        "• Untuk lokal: http://localhost:5000\n" +
        "• Untuk tunneling: https://xxxx.trycloudflare.com\n" +
        "• Untuk cloud (HuggingFace/Render): https://nama-app.hf.space\n\n" +
        "URL saat ini:",
        current
    );
    if (input !== null) {
        const clean = input.trim().replace(/\/$/, '');
        if (clean) {
            localStorage.setItem('faceid_backend_url', clean);
        } else {
            localStorage.removeItem('faceid_backend_url');
        }
        window.location.reload();
    }
}

// â”€â”€â”€ State â”€â”€â”€
let currentMode = 'webcam';
let webcamStream = null;
let webcamActive = false;
let captureInterval = null;
let isProcessing = false;

// â”€â”€â”€ DOM References â”€â”€â”€
const elements = {
    // Navigation
    navStatus: document.getElementById('navStatus'),
    
    // Hero
    statPersons: document.getElementById('statPersons'),
    
    // Mode buttons
    btnWebcam: document.getElementById('btnWebcam'),
    btnUpload: document.getElementById('btnUpload'),
    
    // Video
    panelTitle: document.getElementById('panelTitle'),
    webcamControls: document.getElementById('webcamControls'),
    webcamWrapper: document.getElementById('webcamWrapper'),
    uploadWrapper: document.getElementById('uploadWrapper'),
    webcamVideo: document.getElementById('webcamVideo'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    scanLine: document.getElementById('scanLine'),
    videoPlaceholder: document.getElementById('videoPlaceholder'),
    btnStartCam: document.getElementById('btnStartCam'),
    btnStopCam: document.getElementById('btnStopCam'),
    
    // Upload
    uploadZone: document.getElementById('uploadZone'),
    fileInput: document.getElementById('fileInput'),
    uploadedPreview: document.getElementById('uploadedPreview'),
    uploadedImage: document.getElementById('uploadedImage'),
    uploadOverlayCanvas: document.getElementById('uploadOverlayCanvas'),
    
    // Results
    faceCount: document.getElementById('faceCount'),
    processingIndicator: document.getElementById('processingIndicator'),
    resultsList: document.getElementById('resultsList'),
    emptyState: document.getElementById('emptyState'),
    perfTime: document.getElementById('perfTime'),
    
    // Persons
    personsGrid: document.getElementById('personsGrid'),
};

// â”€â”€â”€ Initialize â”€â”€â”€
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initScrollEffect();
    initDragDrop();
    checkServerStatus();
    loadPersonsList();

    // Auto-refresh status dan daftar orang setiap 4 detik agar progres training terupdate otomatis live
    setInterval(() => {
        checkServerStatus();
        loadPersonsList();
    }, 4000);
});

// ─── Background Particles ───
function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    const count = 28;
    
    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 8 + 's';
        particle.style.animationDuration = (8 + Math.random() * 7) + 's';
        const width = 6 + Math.random() * 6;
        particle.style.width = width + 'px';
        particle.style.height = (width * 1.6) + 'px';
        container.appendChild(particle);
    }
}

// â”€â”€â”€ Scroll Effect â”€â”€â”€
function initScrollEffect() {
    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// â”€â”€â”€ Drag & Drop â”€â”€â”€
function initDragDrop() {
    const zone = elements.uploadZone;
    if (!zone) return;

    ['dragenter', 'dragover'].forEach(event => {
        zone.addEventListener(event, (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(event => {
        zone.addEventListener(event, (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
        });
    });

    zone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processUploadedFile(files[0]);
        }
    });
}

// â”€â”€â”€ Server Status â”€â”€â”€
async function checkServerStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        
        if (data.status === 'online' && data.model_loaded) {
            setStatus('online', `Model aktif \u2022 ${data.total_persons} orang`);
            elements.statPersons.textContent = data.total_persons;
        } else {
            setStatus('offline', 'Model belum dimuat');
        }
    } catch (err) {
        setStatus('offline', 'Server tidak terhubung');
    }
}

function setStatus(state, text) {
    const dot = elements.navStatus.querySelector('.status-dot');
    const label = elements.navStatus.querySelector('.status-text');
    
    dot.className = `status-dot ${state}`;
    label.textContent = text;
}

// â”€â”€â”€ Load Persons â”€â”€â”€
let cachedPersons = [];

async function loadPersonsList() {
    try {
        const res = await fetch(`${API_BASE}/api/persons`);
        const data = await res.json();
        
        if (data.persons && data.persons.length > 0) {
            cachedPersons = data.persons;
            const searchInput = document.getElementById('vaultSearchInput');
            const query = searchInput ? searchInput.value : '';
            renderPersonsList(filterByQuery(cachedPersons, query));
        } else {
            elements.personsGrid.innerHTML = '<div class="loading-state">Belum ada data identitas terdaftar.</div>';
        }
    } catch (err) {
        elements.personsGrid.innerHTML = '<div class="loading-state">Gagal memuat data orang.</div>';
    }
}

function filterPersonsList(query) {
    renderPersonsList(filterByQuery(cachedPersons, query));
}

function filterByQuery(list, query) {
    if (!query || !query.trim()) return list;
    const q = query.toLowerCase().trim();
    return list.filter(p => p.name.toLowerCase().includes(q));
}

function renderPersonsList(persons) {
    if (!elements.personsGrid) return;
    if (persons.length === 0) {
        elements.personsGrid.innerHTML = '<div class="loading-state">Tidak ada nama yang cocok dengan pencarian.</div>';
        return;
    }
    elements.personsGrid.innerHTML = persons.map(p => `
        <div class="person-chip">
            <div class="person-avatar">${getInitials(p.name)}</div>
            <div class="person-info-col">
                <div class="person-name">${escapeHtml(p.name)}</div>
                <div class="person-photos-tag">${p.photos} sampel foto</div>
            </div>
            <div class="person-verified-icon" title="Terenkripsi dalam model">✓</div>
        </div>
    `).join('');
}

// â”€â”€â”€ Mode Switching â”€â”€â”€
function switchMode(mode) {
    currentMode = mode;
    
    // Update mode buttons
    elements.btnWebcam.classList.toggle('active', mode === 'webcam');
    elements.btnUpload.classList.toggle('active', mode === 'upload');
    
    // Show/hide panels
    if (mode === 'webcam') {
        elements.webcamWrapper.classList.remove('hidden');
        elements.uploadWrapper.classList.add('hidden');
        elements.webcamControls.classList.remove('hidden');
        elements.panelTitle.textContent = 'Kamera';
    } else {
        // Stop webcam if switching away
        if (webcamActive) stopWebcam();
        
        elements.webcamWrapper.classList.add('hidden');
        elements.uploadWrapper.classList.remove('hidden');
        elements.webcamControls.classList.add('hidden');
        elements.panelTitle.textContent = 'Upload Foto';
    }
    
    // Clear results
    clearResults();
}

// â”€â”€â”€ Webcam Controls â”€â”€â”€
async function startWebcam() {
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });
        
        elements.webcamVideo.srcObject = webcamStream;
        elements.webcamVideo.play();
        
        webcamActive = true;
        elements.videoPlaceholder.classList.add('hidden');
        elements.btnStartCam.classList.add('hidden');
        elements.btnStopCam.classList.remove('hidden');
        elements.scanLine.classList.add('active');
        
        // Wait for video to be ready, then start capture
        elements.webcamVideo.onloadedmetadata = () => {
            // Sync canvas size
            const video = elements.webcamVideo;
            elements.overlayCanvas.width = video.videoWidth;
            elements.overlayCanvas.height = video.videoHeight;
            
            // Start periodic capture
            captureInterval = setInterval(captureAndRecognize, WEBCAM_INTERVAL_MS);
            // Also capture immediately
            setTimeout(captureAndRecognize, 500);
        };
    } catch (err) {
        console.error('Webcam error:', err);
        alert('Gagal mengakses kamera. Pastikan izin kamera diberikan.');
    }
}

function stopWebcam() {
    webcamActive = false;
    
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
    
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    
    elements.webcamVideo.srcObject = null;
    elements.videoPlaceholder.classList.remove('hidden');
    elements.btnStartCam.classList.remove('hidden');
    elements.btnStopCam.classList.add('hidden');
    elements.scanLine.classList.remove('active');
    
    // Clear overlay
    const ctx = elements.overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
    
    clearResults();
}

// â”€â”€â”€ Capture & Recognize (Webcam) â”€â”€â”€
async function captureAndRecognize() {
    if (!webcamActive || isProcessing) return;
    
    const video = elements.webcamVideo;
    if (video.readyState < 2) return;

    // Create temp canvas for capture
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0);
    
    // Convert to base64 JPEG
    const imageData = tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
    
    // Send to server
    await sendForRecognition(imageData, 'webcam');
}

// â”€â”€â”€ File Upload â”€â”€â”€
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) processUploadedFile(file);
}

function processUploadedFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('File harus berupa gambar (JPG, PNG, WEBP).');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('Ukuran file maksimal 10MB.');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const imageData = e.target.result;
        
        // Show preview
        elements.uploadedImage.src = imageData;
        elements.uploadZone.classList.add('hidden');
        elements.uploadedPreview.classList.remove('hidden');
        
        // Wait for image to load, then sync canvas
        elements.uploadedImage.onload = async () => {
            const img = elements.uploadedImage;
            elements.uploadOverlayCanvas.width = img.naturalWidth;
            elements.uploadOverlayCanvas.height = img.naturalHeight;
            
            // Send for recognition
            await sendForRecognition(imageData, 'upload');
        };
    };
    reader.readAsDataURL(file);
}

function removeUpload() {
    elements.uploadedImage.src = '';
    elements.uploadedPreview.classList.add('hidden');
    elements.uploadZone.classList.remove('hidden');
    elements.fileInput.value = '';
    
    // Clear overlay
    const ctx = elements.uploadOverlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, elements.uploadOverlayCanvas.width, elements.uploadOverlayCanvas.height);
    
    clearResults();
}

// â”€â”€â”€ Send to Server â”€â”€â”€
async function sendForRecognition(imageData, source) {
    if (isProcessing) return;
    isProcessing = true;
    
    elements.processingIndicator.classList.remove('hidden');

    try {
        const res = await fetch(`${API_BASE}/api/recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });

        const data = await res.json();
        
        if (data.error) {
            console.error('Recognition error:', data.error);
        } else {
            displayResults(data.faces, data.processing_time_ms);
            
            // Draw bounding boxes
            if (source === 'webcam') {
                drawBoundingBoxes(elements.overlayCanvas, data.faces, true);
            } else {
                drawBoundingBoxes(elements.uploadOverlayCanvas, data.faces, false);
            }
        }
    } catch (err) {
        console.error('Network error:', err);
    } finally {
        isProcessing = false;
        elements.processingIndicator.classList.add('hidden');
    }
}

// â”€â”€â”€ Draw Bounding Boxes â”€â”€â”€
function drawBoundingBoxes(canvas, faces, isMirrored) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);

    faces.forEach(face => {
        let { x, y, w: bw, h: bh } = face.bbox;
        
        // Mirror x-coordinate for webcam
        if (isMirrored) {
            x = w - x - bw;
        }

        const isRecognized = face.name !== 'Unknown';
        // Warna hijau zamrud (emerald) untuk wajah yang terverifikasi, amber hangat untuk Unknown
        const color = isRecognized ? '#10b981' : '#f59e0b';
        const glowColor = isRecognized ? 'rgba(16,185,129,0.45)' : 'rgba(245,158,11,0.35)';

        // Glow effect
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12;

        // Bounding box - corner style
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        const cornerLen = Math.min(bw, bh) * 0.2;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(x, y + cornerLen);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerLen, y);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(x + bw - cornerLen, y);
        ctx.lineTo(x + bw, y);
        ctx.lineTo(x + bw, y + cornerLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(x, y + bh - cornerLen);
        ctx.lineTo(x, y + bh);
        ctx.lineTo(x + cornerLen, y + bh);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(x + bw - cornerLen, y + bh);
        ctx.lineTo(x + bw, y + bh);
        ctx.lineTo(x + bw, y + bh - cornerLen);
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;

        // Subtle connecting lines
        ctx.strokeStyle = isRecognized ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, bw, bh);

        // Label background
        const label = isRecognized 
            ? `${face.name} (${face.confidence}%)` 
            : 'Unknown';
        
        ctx.font = `600 ${Math.max(14, bw * 0.06)}px Inter, sans-serif`;
        const textMetrics = ctx.measureText(label);
        const textW = textMetrics.width + 16;
        const textH = Math.max(24, bw * 0.08);
        const labelY = y - textH - 6;

        // Label pill
        ctx.fillStyle = isRecognized ? 'rgba(21,128,61,0.95)' : 'rgba(217,119,6,0.95)';
        roundRect(ctx, x, labelY, textW, textH, 6);
        ctx.fill();

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 8, labelY + textH / 2);
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// â”€â”€â”€ Display Results â”€â”€â”€
function displayResults(faces, processingTime) {
    elements.faceCount.textContent = `${faces.length} wajah`;
    elements.perfTime.textContent = `${Math.round(processingTime)} ms`;

    if (faces.length === 0) {
        elements.resultsList.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M9 3H5a2 2 0 0 0-2 2v4"/>
                    <path d="M15 3h4a2 2 0 0 1 2 2v4"/>
                    <path d="M9 21H5a2 2 0 0 1-2-2v-4"/>
                    <path d="M15 21h4a2 2 0 0 0 2-2v-4"/>
                </svg>
                <p>Tidak ada wajah terdeteksi</p>
                <span>Pastikan wajah terlihat jelas di kamera</span>
            </div>
        `;
        return;
    }

    // Sort: recognized first, then by confidence
    const sorted = [...faces].sort((a, b) => {
        if (a.name === 'Unknown' && b.name !== 'Unknown') return 1;
        if (a.name !== 'Unknown' && b.name === 'Unknown') return -1;
        return b.confidence - a.confidence;
    });

    elements.resultsList.innerHTML = sorted.map(face => {
        const isRecognized = face.name !== 'Unknown';
        const cardClass = isRecognized ? 'recognized' : 'unknown';
        const initials = isRecognized ? getInitials(face.name) : '?';
        const confidenceText = isRecognized ? `${face.confidence}% Cocok` : 'Tidak Terdaftar';
        const distanceText = `Cosine: ${face.distance}`;

        return `
            <div class="face-card ${cardClass}">
                <div class="face-avatar">${initials}</div>
                <div class="face-info">
                    <div class="face-name">${escapeHtml(face.name)}</div>
                    <div class="face-meta">
                        <span class="face-confidence">${confidenceText}</span>
                        <span class="face-distance">${distanceText}</span>
                    </div>
                </div>
                ${isRecognized ? `
                    <div class="confidence-bar-container">
                        <div class="confidence-bar" style="width: ${face.confidence}%"></div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function clearResults() {
    elements.faceCount.textContent = '0 wajah';
    elements.perfTime.textContent = '- ms';
    elements.resultsList.innerHTML = `
        <div class="empty-state" id="emptyState">
            <div class="empty-reticle">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M8 15s1.5 2 4 2 4-2 4-2"/>
                    <line x1="9" y1="9" x2="9.01" y2="9"/>
                    <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
            </div>
            <h4 class="empty-title">Menunggu Deteksi Wajah</h4>
            <p class="empty-desc">Nyalakan kamera atau upload foto untuk melihat hasil verifikasi identitas real-time.</p>
        </div>
    `;
}

// â”€â”€â”€ Utilities â”€â”€â”€
function getInitials(name) {
    return name.split(' ')
        .filter(w => w.length > 0)
        .map(w => w[0].toUpperCase())
        .slice(0, 2)
        .join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

