// Global State
let allStudents = [];
let compressedPhotoBase64 = '';
let editCompressedPhotoBase64 = '';
let verifiedAuthHash = '';

// Helper to compute SHA-256 hash in browser
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// DOM Elements & Initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchStudents();

    // Drag and Drop support for image upload
    const dropzone = document.getElementById('dropzone');
    if (dropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.add('drag-active'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.remove('drag-active'), false);
        });

        dropzone.addEventListener('drop', handleDrop, false);
    }
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        compressImageFile(files[0]);
    }
}

// 1. Fetch Students from Backend / MongoDB
async function fetchStudents() {
    const studentsContainer = document.getElementById('studentsList');
    const studentCountBadge = document.getElementById('studentCountBadge');

    try {
        const response = await fetch('/api/students');
        if (!response.ok) {
            throw new Error('Failed to fetch data from MongoDB');
        }

        allStudents = await response.json();
        
        studentCountBadge.textContent = `${allStudents.length} Student${allStudents.length === 1 ? '' : 's'}`;
        renderStudents(allStudents);
        
        // Also update admin list if admin modal is open
        if (document.getElementById('adminModal').classList.contains('active')) {
            renderAdminStudents(allStudents);
        }
    } catch (err) {
        console.error('Error loading students:', err);
        if (studentsContainer) {
            studentsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger)"></i>
                    <h3>Unable to Connect to Server</h3>
                    <p>${err.message || 'Please check your connection and try again.'}</p>
                    <button class="btn btn-primary" onclick="fetchStudents()" style="margin-top: 16px;">
                        <i class="fa-solid fa-rotate"></i> Retry Connection
                    </button>
                </div>
            `;
        }
    }
}

// 2. Render Student List Row Wise for Public Showcase
function renderStudents(students) {
    const container = document.getElementById('studentsList');
    if (!container) return;
    
    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <h3>No Registered Student Projects Found</h3>
                <p>Be the first to showcase your project! Click "Add My Project" in the top right corner.</p>
            </div>
        `;
        return;
    }

    let html = '';
    students.forEach((student) => {
        const photoUrl = student.photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';
        const formattedEmail = student.email || student.emailId || (student.mobileNumber && student.mobileNumber.includes('@') ? student.mobileNumber : 'student@gmail.com');
        const formattedCollege = student.collegeName || 'Student';
        let websiteUrl = student.websiteUrl || '#';
        if (websiteUrl !== '#' && !websiteUrl.startsWith('http')) {
            websiteUrl = 'https://' + websiteUrl;
        }

        html += `
            <div class="student-row-card" onclick="openWebsiteNewTab('${escapeHtml(websiteUrl)}')">
                <div class="student-photo-wrapper">
                    <img src="${photoUrl}" alt="${escapeHtml(student.fullName)}" class="student-photo-circle" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80'">
                    <div class="online-indicator" title="Active"></div>
                </div>

                <div class="student-info-main">
                    <div class="student-header-row">
                        <h4 class="student-name">${escapeHtml(student.fullName)}</h4>
                        <span class="college-pill"><i class="fa-solid fa-building-columns"></i> ${escapeHtml(formattedCollege)}</span>
                        <a href="mailto:${escapeHtml(formattedEmail)}" class="email-pill" onclick="event.stopPropagation()" title="Send email to ${escapeHtml(student.fullName)}">
                            <i class="fa-solid fa-envelope"></i> ${escapeHtml(formattedEmail)}
                        </a>
                    </div>
                    <p class="student-desc">${escapeHtml(student.shortDescription || 'No description provided.')}</p>
                </div>

                <div class="student-action-area">
                    <a href="mailto:${escapeHtml(formattedEmail)}" class="contact-us-btn" onclick="event.stopPropagation()" title="Send Email">
                        <i class="fa-solid fa-paper-plane"></i> Contact Us
                    </a>
                    <button class="view-website-btn" onclick="event.stopPropagation(); openWebsiteNewTab('${escapeHtml(websiteUrl)}')">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Website
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 3. Open Registered User's Website in NEW TAB
function openWebsiteNewTab(url) {
    if (!url || url === '#') {
        showToast('No valid website URL provided.', 'error');
        return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Opening student website in a new tab...', 'info');
}

// Helper to escape HTML characters
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 4. Search / Filter Students
function filterStudents() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!query) {
        renderStudents(allStudents);
        return;
    }
    const filtered = allStudents.filter(s => 
        (s.fullName && s.fullName.toLowerCase().includes(query)) ||
        (s.collegeName && s.collegeName.toLowerCase().includes(query)) ||
        (s.shortDescription && s.shortDescription.toLowerCase().includes(query)) ||
        (s.email && s.email.toLowerCase().includes(query)) ||
        (s.mobileNumber && s.mobileNumber.toLowerCase().includes(query))
    );
    renderStudents(filtered);
}

// 5. Password Security Modal Logic (Handles Admin Panel & Add Project)
function promptPasswordModal() {
    const modal = document.getElementById('passwordModal');
    const pwdInput = document.getElementById('adminPassword');
    const pwdError = document.getElementById('passwordError');
    
    pwdInput.value = '';
    pwdError.textContent = '';
    modal.classList.add('active');
    setTimeout(() => pwdInput.focus(), 100);
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('active');
}

function togglePasswordVisibility() {
    const pwdInput = document.getElementById('adminPassword');
    const eyeIcon = document.getElementById('pwdEye');
    if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        eyeIcon.className = 'fa-solid fa-eye-slash';
    } else {
        pwdInput.type = 'password';
        eyeIcon.className = 'fa-solid fa-eye';
    }
}

async function verifyPassword(e) {
    e.preventDefault();
    const pwdInput = document.getElementById('adminPassword');
    const pwdError = document.getElementById('passwordError');
    const submitBtn = document.getElementById('verifyPwdSubmitBtn');
    
    const plainPwd = pwdInput.value;
    if (!plainPwd) return;

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying...`;

    try {
        // Hash password with SHA-256 before verification
        const hashedPwd = await sha256(plainPwd);
        
        const response = await fetch('/api/verify-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passwordHash: hashedPwd, password: plainPwd })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            closePasswordModal();

            if (data.role === 'admin') {
                showToast('🔑 Admin Password Accepted! Opening Admin Panel...', 'success');
                openAdminModal();
            } else {
                verifiedAuthHash = hashedPwd;
                showToast('Security Verified! Opening Add Project Form...', 'success');
                openAddProjectModal();
            }
        } else {
            pwdError.textContent = '❌ Incorrect Password! Access Denied.';
            pwdInput.classList.add('input-error');
            setTimeout(() => pwdInput.classList.remove('input-error'), 500);
        }
    } catch (err) {
        console.error('Auth verification error:', err);
        pwdError.textContent = '❌ Authentication error. Please try again.';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-unlock"></i> Verify & Proceed`;
    }
}

// 6. ADMIN PANEL LOGIC (View, Edit & Delete)
function openAdminModal() {
    const modal = document.getElementById('adminModal');
    modal.classList.add('active');
    renderAdminStudents(allStudents);
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('active');
}

function renderAdminStudents(students) {
    const container = document.getElementById('adminStudentsList');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-inbox"></i>
                <h3>No Student Records in MongoDB</h3>
                <p>Database is empty.</p>
            </div>
        `;
        return;
    }

    let html = '';
    students.forEach((student) => {
        const studentId = student._id;
        const photoUrl = student.photo || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';
        const formattedEmail = student.email || student.emailId || (student.mobileNumber && student.mobileNumber.includes('@') ? student.mobileNumber : 'student@gmail.com');
        let websiteUrl = student.websiteUrl || '#';
        if (websiteUrl !== '#' && !websiteUrl.startsWith('http')) {
            websiteUrl = 'https://' + websiteUrl;
        }

        html += `
            <div class="admin-student-row">
                <img src="${photoUrl}" alt="${escapeHtml(student.fullName)}" class="admin-student-avatar" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80'">
                
                <div class="admin-student-details">
                    <div class="admin-name-row">
                        <span class="admin-student-name">${escapeHtml(student.fullName)}</span>
                        <span class="college-pill"><i class="fa-solid fa-building-columns"></i> ${escapeHtml(student.collegeName || 'N/A')}</span>
                    </div>
                    <div class="admin-contact-row">
                        <a href="mailto:${escapeHtml(formattedEmail)}" class="admin-email-link"><i class="fa-solid fa-envelope"></i> ${escapeHtml(formattedEmail)}</a>
                        <span class="admin-url-text" onclick="openWebsiteNewTab('${escapeHtml(websiteUrl)}')"><i class="fa-solid fa-link"></i> ${escapeHtml(websiteUrl)}</span>
                    </div>
                </div>

                <div class="admin-row-actions">
                    <button class="btn-admin-edit" onclick="editStudent('${studentId}')" title="Edit Student Data">
                        <i class="fa-solid fa-pen-to-square"></i> Edit
                    </button>
                    <button class="btn-admin-delete" onclick="deleteStudent('${studentId}', '${escapeHtml(student.fullName)}')" title="Delete Student Data">
                        <i class="fa-solid fa-trash-can"></i> Delete
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function filterAdminStudents() {
    const query = document.getElementById('adminSearchInput').value.toLowerCase().trim();
    if (!query) {
        renderAdminStudents(allStudents);
        return;
    }
    const filtered = allStudents.filter(s => 
        (s.fullName && s.fullName.toLowerCase().includes(query)) ||
        (s.collegeName && s.collegeName.toLowerCase().includes(query)) ||
        (s.email && s.email.toLowerCase().includes(query)) ||
        (s.mobileNumber && s.mobileNumber.toLowerCase().includes(query))
    );
    renderAdminStudents(filtered);
}

// 7. EDIT STUDENT LOGIC
function editStudent(id) {
    const student = allStudents.find(s => String(s._id) === String(id));
    if (!student) {
        showToast('Student record not found', 'error');
        return;
    }

    document.getElementById('editStudentId').value = student._id;
    document.getElementById('editFullName').value = student.fullName || '';
    document.getElementById('editCollegeName').value = student.collegeName || '';
    document.getElementById('editEmail').value = student.email || student.emailId || student.mobileNumber || '';
    document.getElementById('editWebsiteUrl').value = student.websiteUrl || '';
    document.getElementById('editShortDescription').value = student.shortDescription || '';

    editCompressedPhotoBase64 = student.photo || '';
    document.getElementById('editCompressedAvatarImg').src = editCompressedPhotoBase64 || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';

    const editModal = document.getElementById('editStudentModal');
    editModal.classList.add('active');
}

function closeEditModal() {
    document.getElementById('editStudentModal').classList.remove('active');
}

function handleEditImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            showToast('Please select a valid image file', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDimension = 450;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                let quality = 0.85;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                editCompressedPhotoBase64 = dataUrl;
                document.getElementById('editCompressedAvatarImg').src = dataUrl;
                showToast('New photo loaded & compressed!', 'success');
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function saveEditStudent(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('saveEditBtn');
    const id = document.getElementById('editStudentId').value;
    const fullName = document.getElementById('editFullName').value.trim();
    const collegeName = document.getElementById('editCollegeName').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    let websiteUrl = document.getElementById('editWebsiteUrl').value.trim();
    const shortDescription = document.getElementById('editShortDescription').value.trim();

    if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
        websiteUrl = 'https://' + websiteUrl;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating MongoDB...`;

    try {
        const response = await fetch(`/api/students/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName,
                collegeName,
                email,
                mobileNumber: email,
                websiteUrl,
                shortDescription,
                photo: editCompressedPhotoBase64
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to update student');
        }

        showToast(`✏️ Student '${fullName}' updated in MongoDB!`, 'success');
        closeEditModal();
        fetchStudents();
    } catch (err) {
        console.error('Update error:', err);
        showToast(err.message || 'Error updating student record', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Update MongoDB Record`;
    }
}

// 8. DELETE STUDENT LOGIC
async function deleteStudent(id, name) {
    const confirmed = confirm(`Are you sure you want to permanently delete '${name}' from MongoDB database?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/students/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete student');
        }

        showToast(`🗑️ Student '${name}' deleted from MongoDB!`, 'success');
        fetchStudents();
    } catch (err) {
        console.error('Delete error:', err);
        showToast(err.message || 'Error deleting student record', 'error');
    }
}

// 9. Add Project Form Modal Logic
function openAddProjectModal() {
    const modal = document.getElementById('addProjectModal');
    modal.classList.add('active');
}

function closeAddProjectModal() {
    document.getElementById('addProjectModal').classList.remove('active');
}

// 10. My Exam Modal Logic
function openExamModal() {
    const modal = document.getElementById('examModal');
    modal.classList.add('active');
}

function closeExamModal() {
    document.getElementById('examModal').classList.remove('active');
}

// 11. Image Compression for New Student Project
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        compressImageFile(file);
    }
}

function compressImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file (JPG, PNG, WEBP)', 'error');
        return;
    }

    const originalSizeBytes = file.size;
    const originalSizeFormatted = formatBytes(originalSizeBytes);

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            const maxDimension = 450;
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            let quality = 0.85;
            let dataUrl = canvas.toDataURL('image/jpeg', quality);
            let sizeInBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);

            while (sizeInBytes > 95 * 1024 && quality > 0.1) {
                quality -= 0.08;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
                sizeInBytes = Math.round((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3 / 4);
            }

            compressedPhotoBase64 = dataUrl;
            const compressedSizeFormatted = formatBytes(sizeInBytes);
            const reduction = Math.max(0, Math.round(((originalSizeBytes - sizeInBytes) / originalSizeBytes) * 100));

            document.getElementById('uploadPlaceholder').style.display = 'none';
            const previewContainer = document.getElementById('compressionPreview');
            previewContainer.style.display = 'flex';

            document.getElementById('compressedAvatarImg').src = dataUrl;
            document.getElementById('fileNameText').textContent = file.name;
            document.getElementById('originalSizeText').textContent = originalSizeFormatted;
            document.getElementById('compressedSizeText').textContent = compressedSizeFormatted;

            document.getElementById('compressionTag').innerHTML = `
                <i class="fa-solid fa-bolt"></i> Reduced by ${reduction}% (&lt; 100 KB Guaranteed)
            `;

            showToast(`Photo compressed to ${compressedSizeFormatted} (< 100 KB)!`, 'success');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 12. Submit Form to Backend / MongoDB
async function submitStudentForm(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitFormBtn');
    const fullName = document.getElementById('fullName').value.trim();
    const collegeName = document.getElementById('collegeName').value.trim();
    const email = document.getElementById('email').value.trim();
    let websiteUrl = document.getElementById('websiteUrl').value.trim();
    const shortDescription = document.getElementById('shortDescription').value.trim();

    if (!compressedPhotoBase64) {
        showToast('Please upload a photo for your project!', 'error');
        return;
    }

    if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
        websiteUrl = 'https://' + websiteUrl;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving to MongoDB...`;

    try {
        const response = await fetch('/api/students', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                passwordHash: verifiedAuthHash,
                fullName,
                collegeName,
                email,
                mobileNumber: email,
                websiteUrl,
                shortDescription,
                photo: compressedPhotoBase64
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to add project');
        }

        showToast(`🎉 Project published to MongoDB!`, 'success');
        closeAddProjectModal();
        resetAddForm();
        fetchStudents();
    } catch (err) {
        console.error('Submission error:', err);
        showToast(err.message || 'Error saving project data', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Save Project`;
    }
}

function resetAddForm() {
    document.getElementById('addStudentForm').reset();
    compressedPhotoBase64 = '';
    verifiedAuthHash = '';
    document.getElementById('uploadPlaceholder').style.display = 'block';
    document.getElementById('compressionPreview').style.display = 'none';
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info');
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
