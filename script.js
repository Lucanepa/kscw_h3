let supabase;
let selectedFiles = [];
let selectedImages = [];
let imageCounter = 1;

const el = (id) => document.getElementById(id)
const grid = el('grid')
const selectedFilesDiv = el('selectedFiles')
const fileList = el('fileList')

async function connect() {
  supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  
  // Test bucket access
  const { data, error } = await supabase.storage.from(SUPABASE_CONFIG.bucket).list('', { limit: 1 })
  if (error) {
    console.error('Bucket access test failed:', error)
    alert(`Cannot access bucket "${SUPABASE_CONFIG.bucket}":\n\n${error.message}\n\nPlease check:\n1. Bucket exists in Supabase dashboard\n2. RLS is disabled on the bucket\n3. Bucket is set to public`)
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
    if (error) { console.error(error); alert('List error: ' + error.message); return }
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
    if (!confirm('Delete this image?')) return
    const { error } = await supabase.storage.from(bucket).remove([name])
    if (error) return alert('Delete failed: ' + error.message)
    item.remove()
  })
}

async function generateFileName() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${year}${month}${day}`
  
  // Get list of existing files to find next available number
  const { data: existingFiles } = await supabase.storage.from(SUPABASE_CONFIG.bucket).list('')
  const existingNames = existingFiles ? existingFiles.map(f => f.name) : []
  
  // Find the next available pic number for today
  let picNumber = 1
  while (existingNames.includes(`${datePrefix}_pic${picNumber}.jpg`)) {
    picNumber++
  }
  
  return `${datePrefix}_pic${picNumber}.jpg`
}

function updateDeleteButton() {
  const deleteBtn = el('deleteSelected')
  if (deleteBtn) {
    deleteBtn.disabled = selectedImages.length === 0
    deleteBtn.textContent = selectedImages.length > 0 ? `Delete Selected (${selectedImages.length})` : 'Delete Selected'
  }
}

async function deleteSelected() {
  if (!supabase) return alert('Please connect to Supabase first')
  if (selectedImages.length === 0) return alert('No images selected')
  
  const countToDelete = selectedImages.length
  if (!confirm(`Delete ${countToDelete} selected image(s)? This cannot be undone!`)) return
  
  const bucket = SUPABASE_CONFIG.bucket
  const { error } = await supabase.storage.from(bucket).remove(selectedImages)
  if (error) return alert('Delete failed: ' + error.message)
  
  selectedImages = []
  updateDeleteButton()
  await listAll()
  alert(`Successfully deleted ${countToDelete} image(s)!`)
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
  if (!supabase) return alert('Please connect to Supabase first')
  if (selectedFiles.length === 0) return alert('No files selected')
  
  const bucket = SUPABASE_CONFIG.bucket
  const totalFiles = selectedFiles.length
  let completedFiles = 0
  
  for (let i = 0; i < selectedFiles.length; i++) {
    const f = selectedFiles[i]
    const fileName = await generateFileName()
    
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, f, {
      upsert: false,
      cacheControl: '3600',
      contentType: f.type
    })
    
    if (error) { 
      console.error('Upload error details:', error)
      return alert(`Upload failed for ${f.name}:\n\nError: ${error.message}\n\nThis usually means:\n1. RLS is enabled on the bucket (disable it in Supabase dashboard)\n2. Bucket doesn't exist\n3. Insufficient permissions\n\nCheck the browser console for more details.`) 
    }
    
    completedFiles++
  }
  
  selectedFiles = []
  displaySelectedFiles()
  await listAll()
  alert(`Successfully uploaded ${completedFiles} file(s)!`)
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