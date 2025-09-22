let supabase;
let selectedFiles = [];
let selectedImages = [];
let imageCounter = 1;
let isUploading = false;

const el = (id) => document.getElementById(id)
const grid = el('grid')
const selectedFilesDiv = el('selectedFiles')
const fileList = el('fileList')

// Page-based alert system
function showAlert(message, type = 'info') {
  // Remove existing alerts
  const existingAlerts = document.querySelectorAll('.page-alert')
  existingAlerts.forEach(alert => alert.remove())
  
  const alert = document.createElement('div')
  alert.className = `page-alert page-alert-${type}`
  alert.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#3b82f6'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 1000;
    max-width: 400px;
    font-size: 14px;
    line-height: 1.4;
  `
  alert.textContent = message
  
  document.body.appendChild(alert)
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (alert.parentNode) {
      alert.remove()
    }
  }, 5000)
}

function showConfirm(message, callback) {
  // Remove existing confirm dialogs
  const existingConfirms = document.querySelectorAll('.page-confirm')
  existingConfirms.forEach(confirm => confirm.remove())
  
  const overlay = document.createElement('div')
  overlay.className = 'page-confirm'
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    z-index: 1001;
    display: flex;
    align-items: center;
    justify-content: center;
  `
  
  const dialog = document.createElement('div')
  dialog.style.cssText = `
    background: #1e293b;
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    margin: 20px;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);
  `
  
  dialog.innerHTML = `
    <div style="color: #f1f5f9; margin-bottom: 16px; line-height: 1.5;">${message}</div>
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="confirm-cancel" style="
        background: #374151;
        color: #f1f5f9;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
      ">Cancel</button>
      <button id="confirm-ok" style="
        background: #dc2626;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
      ">OK</button>
    </div>
  `
  
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)
  
  dialog.querySelector('#confirm-cancel').addEventListener('click', () => {
    overlay.remove()
    callback(false)
  })
  
  dialog.querySelector('#confirm-ok').addEventListener('click', () => {
    overlay.remove()
    callback(true)
  })
}

async function connect() {
  supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  
  // Test bucket access
  const { data, error } = await supabase.storage.from(SUPABASE_CONFIG.bucket).list('', { limit: 1 })
  if (error) {
    console.error('Bucket access test failed:', error)
    showAlert(`Cannot access bucket "${SUPABASE_CONFIG.bucket}":\n\n${error.message}\n\nPlease check:\n1. Bucket exists in Supabase dashboard\n2. RLS is disabled on the bucket\n3. Bucket is set to public`, 'error')
    return
  }
  
  await listAll()
}

async function listAll() {
  grid.innerHTML = ''
  if (!supabase) return
  const bucket = SUPABASE_CONFIG.bucket
  // list recursively by prefix '' — we'll paginate
  let page = 0, done = false
  const all = []
  while (!done) {
    const { data, error } = await supabase.storage.from(bucket).list('', {
      limit: 100,
      offset: page * 100,
      sortBy: { column: 'updated_at', order: 'desc' }
    })
    if (error) { console.error(error); showAlert('List error: ' + error.message, 'error'); return }
    all.push(...data.filter(x => x.name))
    if (!data.length || data.length < 100) done = true; else page++
  }
  // Render each file
  for (const obj of all) {
    await renderItem(bucket, obj)
  }
}

async function renderItem(bucket, obj) {
  // Try to get a signed URL first, fallback to public URL
  let url
  try {
    const { data: signedData, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(obj.name, 60 * 60 * 24) // 24 hours
    if (!signedError && signedData) {
      url = signedData.signedUrl
      console.log('Using signed URL for:', obj.name)
    } else {
      console.warn('Signed URL failed for:', obj.name, signedError)
      throw new Error('Signed URL failed')
    }
  } catch (error) {
    // Fallback to public URL
    const { data } = supabase.storage.from(bucket).getPublicUrl(obj.name)
    url = data.publicUrl
    console.log('Using public URL for:', obj.name, 'URL:', url)
  }

  const item = document.createElement('div')
  item.className = 'item'
  
  // Create image element with error handling
  const img = document.createElement('img')
  img.loading = 'lazy'
  img.alt = obj.name
  img.style.cssText = 'width: 100%; height: 180px; object-fit: cover; background: #0a0e20'
  
  // Add error handling
  img.onerror = function() {
    console.error('Failed to load image:', obj.name, 'URL:', url)
    console.error('This usually means:')
    console.error('1. Bucket is not set to public')
    console.error('2. RLS policies are blocking access')
    console.error('3. File does not exist or was deleted')
    this.style.background = '#1a0e20'
    this.style.display = 'flex'
    this.style.alignItems = 'center'
    this.style.justifyContent = 'center'
    this.style.color = '#94a3b8'
    this.style.fontSize = '12px'
    this.alt = 'Failed to load'
    this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgdmlld0JveD0iMCAwIDE4MCAxODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxODAiIGhlaWdodD0iMTgwIiBmaWxsPSIjMGEwZTIwIi8+CjxwYXRoIGQ9Ik04MCA2MEM4OC4yODQzIDYwIDk1IDY2LjcxNTcgOTUgNzVWMTI1Qzk1IDEzMy4yODQgODguMjg0MyAxNDAgODAgMTQwQzcxLjcxNTcgMTQwIDY1IDEzMy4yODQgNjUgMTI1Vjc1QzY1IDY2LjcxNTcgNzEuNzE1NyA2MCA4MCA2MFoiIGZpbGw9IiMzMzQxNTUiLz4KPHBhdGggZD0iTTgwIDcwQzgzLjMxMzcgNzAgODYgNzIuNjg2MyA4NiA3NlYxMjRDODYgMTI3LjMxNCA4My4zMTM3IDEzMCA4MCAxMzBDNzYuNjg2MyAxMzAgNzQgMTI3LjMxNCA3NCAxMjRWNzZDNzQgNzIuNjg2MyA3Ni42ODYzIDcwIDgwIDcwWiIgZmlsbD0iIzk0YTNiOCIvPgo8L3N2Zz4K'
  }
  
  img.onload = function() {
    console.log('Successfully loaded image:', url)
  }
  
  img.src = url
  
  const metaDiv = document.createElement('div')
  metaDiv.className = 'meta'
  metaDiv.innerHTML = `
    <div class="row-between">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer">
        <input type="checkbox" data-name="${obj.name}" style="margin:0" />
        <span>${obj.name}</span>
      </label>
      <span class="caps">${(obj.metadata?.size||0)/1024|0} KB</span>
    </div>
    <div class="row" style="justify-content:space-between">
      <a href="${url}" target="_blank" rel="noreferrer">Open</a>
      <button class="danger" data-name="${obj.name}">Delete</button>
    </div>
  `
  
  item.appendChild(img)
  item.appendChild(metaDiv)
  grid.appendChild(item)
  
  // Add checkbox event listener
  const checkbox = item.querySelector('input[type="checkbox"]')
  checkbox.addEventListener('change', (e) => {
    const name = e.target.getAttribute('data-name')
    if (e.target.checked) {
      selectedImages.push(name)
    } else {
      selectedImages = selectedImages.filter(img => img !== name)
    }
    updateDeleteButton()
  })
  
  // Add individual delete button
  const delBtn = item.querySelector('button[data-name]')
  delBtn.addEventListener('click', async (e) => {
    const name = e.currentTarget.getAttribute('data-name')
    showConfirm('Delete this image?', async (confirmed) => {
      if (!confirmed) return
      const { error } = await supabase.storage.from(bucket).remove([name])
      if (error) return showAlert('Delete failed: ' + error.message, 'error')
      item.remove()
    })
  })
}

async function generateFileName() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${day}${month}${year}`
  
  // Generate a unique hash using timestamp + random number
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 10000)
  const hash = `${timestamp}_${random}`
  
  return `${datePrefix}_${hash}.jpg`
}

function updateDeleteButton() {
  const deleteBtn = el('deleteSelected')
  if (deleteBtn) {
    deleteBtn.disabled = selectedImages.length === 0
    deleteBtn.textContent = selectedImages.length > 0 ? `Delete Selected (${selectedImages.length})` : 'Delete Selected'
  }
}

async function deleteSelected() {
  if (!supabase) return showAlert('Please connect to Supabase first', 'error')
  if (selectedImages.length === 0) return showAlert('No images selected', 'error')
  
  const countToDelete = selectedImages.length
  showConfirm(`Delete ${countToDelete} selected image(s)? This cannot be undone!`, async (confirmed) => {
    if (!confirmed) return
    
    const bucket = SUPABASE_CONFIG.bucket
    const { error } = await supabase.storage.from(bucket).remove(selectedImages)
    if (error) return showAlert('Delete failed: ' + error.message, 'error')
    
    selectedImages = []
    updateDeleteButton()
    await listAll()
    showAlert(`Successfully deleted ${countToDelete} image(s)!`, 'success')
  })
}

function displaySelectedFiles() {
  const uploadBtn = el('uploadSelected')
  const clearBtn = el('clearSelection')
  
  if (selectedFiles.length === 0) {
    selectedFilesDiv.classList.add('hidden')
    if (uploadBtn) uploadBtn.disabled = true
    if (clearBtn) clearBtn.disabled = true
    return
  }
  
  selectedFilesDiv.classList.remove('hidden')
  if (uploadBtn) uploadBtn.disabled = false
  if (clearBtn) clearBtn.disabled = false
  
  fileList.innerHTML = ''
  
  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('div')
    fileItem.style.cssText = 'display:flex; align-items:center; gap:12px; padding:8px; background:#0a0e20; border-radius:8px; margin-bottom:4px'
    
    // Create thumbnail
    const thumbnail = document.createElement('img')
    thumbnail.style.cssText = 'width:60px; height:60px; object-fit:cover; border-radius:6px; background:#1a0e20'
    thumbnail.src = URL.createObjectURL(file)
    
    // Create file info
    const fileInfo = document.createElement('div')
    fileInfo.style.cssText = 'flex:1; display:flex; flex-direction:column; gap:4px'
    fileInfo.innerHTML = `
      <span style="font-size:14px; color:#e2e8f0">${file.name}</span>
      <span style="font-size:12px; color:#94a3b8">${(file.size/1024).toFixed(0)} KB</span>
    `
    
    // Create remove button
    const removeBtn = document.createElement('button')
    removeBtn.className = 'danger'
    removeBtn.textContent = 'Remove'
    removeBtn.setAttribute('data-index', index)
    
    fileItem.appendChild(thumbnail)
    fileItem.appendChild(fileInfo)
    fileItem.appendChild(removeBtn)
    fileList.appendChild(fileItem)
    
    removeBtn.addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'))
      selectedFiles.splice(index, 1)
      displaySelectedFiles()
    })
  })
}

async function uploadSelected() {
  if (!supabase) return showAlert('Please connect to Supabase first', 'error')
  if (selectedFiles.length === 0) return showAlert('No files selected', 'error')
  if (isUploading) return showAlert('Upload already in progress', 'error')
  
  isUploading = true
  const uploadBtn = el('uploadSelected')
  const chooseBtn = el('chooseFiles')
  const clearBtn = el('clearSelection')
  
  // Disable buttons and clear selection immediately
  if (uploadBtn) uploadBtn.disabled = true
  if (chooseBtn) chooseBtn.disabled = true
  if (clearBtn) clearBtn.disabled = true
  
  // Store files to upload and clear the selection immediately
  const filesToUpload = [...selectedFiles]
  selectedFiles = []
  el('fileInput').value = ''
  displaySelectedFiles()
  
  const bucket = SUPABASE_CONFIG.bucket
  const totalFiles = filesToUpload.length
  let completedFiles = 0
  
  // Show initial progress
  showAlert(`Starting upload: 0 out of ${totalFiles} images`, 'info')
  
  for (let i = 0; i < filesToUpload.length; i++) {
    const f = filesToUpload[i]
    const fileName = await generateFileName()
    
    // Update progress
    showAlert(`Uploading image ${i + 1} out of ${totalFiles}: ${f.name}`, 'info')
    
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, f, {
      upsert: false,
      cacheControl: '3600',
      contentType: f.type
    })
    
    if (error) { 
      console.error('Upload error details:', error)
      isUploading = false
      // Re-enable buttons
      if (uploadBtn) uploadBtn.disabled = false
      if (chooseBtn) chooseBtn.disabled = false
      if (clearBtn) clearBtn.disabled = false
      return showAlert(`Upload failed for ${f.name}:\n\nError: ${error.message}\n\nThis usually means:\n1. RLS is enabled on the bucket (disable it in Supabase dashboard)\n2. Bucket doesn't exist\n3. Insufficient permissions\n\nCheck the browser console for more details.`, 'error') 
    }
    
    completedFiles++
  }
  
  isUploading = false
  // Re-enable buttons
  if (uploadBtn) uploadBtn.disabled = false
  if (chooseBtn) chooseBtn.disabled = false
  if (clearBtn) clearBtn.disabled = false
  
  await listAll()
  showAlert(`Successfully uploaded ${completedFiles} out of ${totalFiles} file(s)!`, 'success')
}


// File input functionality
function setupFileInput() {
  const fileInput = el('fileInput')
  const chooseFilesBtn = el('chooseFiles')
  
  if (!fileInput || !chooseFilesBtn) return
  
  chooseFilesBtn.addEventListener('click', () => {
    fileInput.click()
  })
  
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'))
    if (files.length > 0) {
      selectedFiles = [...selectedFiles, ...files]
      displaySelectedFiles()
      console.log('Files added:', files.length, 'Total selected:', selectedFiles.length)
    }
  })
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'refresh') listAll()
  if (e.target.id === 'uploadSelected') uploadSelected()
  if (e.target.id === 'clearSelection') {
    selectedFiles = []
    displaySelectedFiles()
  }
  if (e.target.id === 'deleteSelected') deleteSelected()
})

// Auto-connect when page loads
document.addEventListener('DOMContentLoaded', () => {
  setupFileInput()
  connect()
  // Initialize button states
  displaySelectedFiles()
  updateDeleteButton()
})