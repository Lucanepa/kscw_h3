let supabase;

const el = (id) => document.getElementById(id)
const grid = el('grid')
const bar = el('bar')

function setProgress(p) { bar.style.width = p + '%' }

async function connect() {
  supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
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
  const mode = 'public' // Always use public mode since we removed the selector
  // Get a URL for display
  let url
  if (mode === 'public') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(obj.name)
    url = data.publicUrl
  } else {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(obj.name, 60 * 10) // 10 min
    if (error) { console.warn('signed url error', error); return }
    url = data.signedUrl
  }
  // We also want metadata: owner, updated_at
  // storage.list returns only FileObject; owner is not included. We can infer deletability by trying to create a signed URL for delete, but better: try a lightweight delete check via RPC.
  // Simpler: show a Delete button that calls delete; if policy denies, we show error.

  const item = document.createElement('div')
  item.className = 'item'
  item.innerHTML = `
    <img loading="lazy" src="${url}" alt="${obj.name}" />
    <div class="meta">
      <div class="row-between"><span>${obj.name}</span><span class="caps">${(obj.metadata?.size||0)/1024|0} KB</span></div>
      <div class="row" style="justify-content:space-between">
        <a href="${url}" target="_blank" rel="noreferrer">Open</a>
        <button class="danger" data-name="${obj.name}">Delete</button>
      </div>
    </div>`
  grid.appendChild(item)
  const delBtn = item.querySelector('button[data-name]')
  delBtn.addEventListener('click', async (e) => {
    const name = e.currentTarget.getAttribute('data-name')
    if (!confirm('Delete this image?')) return
    const { error } = await supabase.storage.from(bucket).remove([name])
    if (error) return alert('Delete failed: ' + error.message)
    item.remove()
  })
}

async function upload() {
  if (!supabase) return alert('Please connect to Supabase first')
  const files = el('file').files
  if (!files || files.length === 0) return alert('Pick one or more files')
  
  const bucket = SUPABASE_CONFIG.bucket
  const totalFiles = files.length
  let completedFiles = 0
  
  setProgress(5)
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const ext = f.name.split('.').pop()
    const now = new Date().toISOString().replaceAll(':', '-')
    // Name pattern: <timestamp>-<random>.<ext>
    const path = `${now}-${Math.random().toString(36).slice(2)}.${ext}`
    
    const { data, error } = await supabase.storage.from(bucket).upload(path, f, {
      upsert: false,
      cacheControl: '3600',
      contentType: f.type
    })
    
    if (error) { 
      setProgress(0)
      return alert(`Upload failed for ${f.name}: ${error.message}`) 
    }
    
    completedFiles++
    const progress = Math.round((completedFiles / totalFiles) * 100)
    setProgress(progress)
  }
  
  el('file').value = ''
  await listAll()
  setTimeout(()=> setProgress(0), 1200)
}

// Drag and drop functionality
const dropZone = el('dropZone')
const fileInput = el('file')

dropZone.addEventListener('click', () => fileInput.click())

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.style.borderColor = '#8b5cf6'
  dropZone.style.background = '#1a0b2e'
})

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault()
  dropZone.style.borderColor = '#334155'
  dropZone.style.background = '#0a0e20'
})

dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.style.borderColor = '#334155'
  dropZone.style.background = '#0a0e20'
  
  const files = e.dataTransfer.files
  if (files.length > 0) {
    fileInput.files = files
    upload()
  }
})

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    upload()
  }
})

document.addEventListener('click', (e) => {
  if (e.target.id === 'connect') connect()
  if (e.target.id === 'refresh') listAll()
  if (e.target.id === 'upload') upload()
})

// Auto-connect when page loads
document.addEventListener('DOMContentLoaded', () => {
  connect()
})
