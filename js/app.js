(() => {
  const input = document.querySelector('#fileInput');
  const dropZone = document.querySelector('#dropZone');
  const canvas = document.querySelector('#previewCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tolerance = document.querySelector('#tolerance');
  const toleranceValue = document.querySelector('#toleranceValue');
  const sampleButton = document.querySelector('#sampleButton');
  const pickOverlay = document.querySelector('#pickOverlay');
  const sampleSwatch = document.querySelector('#sampleSwatch');
  const sampleLabel = document.querySelector('#sampleLabel');
  const downloadButton = document.querySelector('#downloadButton');
  const copyButton = document.querySelector('#copyButton');
  const previewStatus = document.querySelector('#previewStatus');
  const emptyState = document.querySelector('#emptyState');
  const fileInfo = document.querySelector('#fileInfo');
  let sourceImage = null;
  let sourceName = 'image';
  let background = [255, 255, 255];
  let picking = false;
  let renderTimer = 0;
  let generation = 0;

  const averageCorner = (imageData, x, y, width, height) => {
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const px = Math.min(width - 1, x + dx), py = Math.min(height - 1, y + dy);
      const i = (py * width + px) * 4;
      if (imageData.data[i + 3] > 180) { r += imageData.data[i]; g += imageData.data[i + 1]; b += imageData.data[i + 2]; count++; }
    }
    return count ? [r / count, g / count, b / count] : [255, 255, 255];
  };

  function setBackground(color, label = 'Picked from your image') {
    background = color.map(Math.round);
    sampleSwatch.style.backgroundColor = `rgb(${background.join(',')})`;
    sampleLabel.textContent = label;
    if (sourceImage) scheduleRender();
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    previewStatus.textContent = 'UPDATING PREVIEW';
    renderTimer = setTimeout(render, 20);
  }

  function render() {
    if (!sourceImage) return;
    const currentGeneration = ++generation;
    const w = sourceImage.naturalWidth, h = sourceImage.naturalHeight;
    canvas.width = w; canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sourceImage, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    const corners = [[0,0], [Math.max(0,w-4),0], [0,Math.max(0,h-4)], [Math.max(0,w-4),Math.max(0,h-4)]]
      .map(([x,y]) => averageCorner(imageData,x,y,w,h)).sort((a,b) => (a[0]+a[1]+a[2])-(b[0]+b[1]+b[2]));
    const initialBg = [0,1,2].map(channel => (corners[1][channel]+corners[2][channel])/2);
    if (sampleLabel.textContent === 'Sampled from the corner') {
      background = initialBg.map(Math.round);
      sampleSwatch.style.backgroundColor = `rgb(${background.join(',')})`;
    }
    const threshold = Number(tolerance.value);
    const outer = threshold + 34;
    const size = w*h;
    const seen = new Uint8Array(size);
    const stack = new Int32Array(size);
    let top = 0;
    const enqueue = index => {
      if (seen[index]) return;
      const p = index*4;
      if (pixels[p+3] === 0) { seen[index]=1; return; }
      const dr=pixels[p]-background[0], dg=pixels[p+1]-background[1], db=pixels[p+2]-background[2];
      if (Math.sqrt(dr*dr+dg*dg+db*db) <= outer) { seen[index]=1; stack[top++]=index; }
    };
    for(let x=0;x<w;x++){enqueue(x);enqueue((h-1)*w+x);}
    for(let y=1;y<h-1;y++){enqueue(y*w);enqueue(y*w+w-1);}
    while(top){
      const index=stack[--top], x=index%w, y=(index/w)|0, p=index*4;
      const dr=pixels[p]-background[0], dg=pixels[p+1]-background[1], db=pixels[p+2]-background[2];
      const distance=Math.sqrt(dr*dr+dg*dg+db*db);
      const alpha=Math.max(0,Math.min(1,(distance-threshold)/(outer-threshold)));
      pixels[p+3]=Math.round(pixels[p+3]*alpha);
      if(x>0) enqueue(index-1);
      if(x<w-1) enqueue(index+1);
      if(y>0) enqueue(index-w);
      if(y<h-1) enqueue(index+w);
    }
    if(currentGeneration !== generation) return;
    ctx.putImageData(imageData,0,0);
    previewStatus.textContent='BACKGROUND REMOVED';
    downloadButton.disabled=false; copyButton.disabled=false;
  }

  function loadFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) { alert('Please choose a JPEG or PNG image.'); return; }
    if (file.size > 25*1024*1024) { alert('This image is larger than 25 MB. Please choose a smaller file.'); return; }
    const url=URL.createObjectURL(file), image=new Image();
    image.onload=()=>{
      if(image.naturalWidth*image.naturalHeight>16000000){URL.revokeObjectURL(url);alert('This image has too many pixels to process smoothly in your browser. Please use an image under 16 megapixels.');return;}
      if(sourceImage?.src?.startsWith('blob:')) URL.revokeObjectURL(sourceImage.src);
      sourceImage=image; sourceName=file.name.replace(/\.[^.]+$/,'')||'image';
      canvas.hidden=false; emptyState.hidden=true;
      fileInfo.hidden=false;
      document.querySelector('#fileName').textContent=file.name;
      document.querySelector('#fileDimensions').textContent=`${image.naturalWidth} × ${image.naturalHeight} px`;
      document.querySelector('#fileThumb').style.backgroundImage=`url("${url}")`;
      document.querySelector('#previewDimensions').textContent=`${image.naturalWidth} × ${image.naturalHeight} px`;
      document.querySelector('#canvasHint').textContent='Adjust tolerance or sample another color.';
      tolerance.disabled=false; sampleButton.disabled=false;
      setBackground([255,255,255],'Sampled from the corner');
      scheduleRender();
    };
    image.onerror=()=>{URL.revokeObjectURL(url);alert('This image could not be opened. Please try another file.');};
    image.src=url;
  }

  input.addEventListener('change',()=>{loadFile(input.files[0]);input.value='';});
  dropZone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}});
  for(const eventName of ['dragenter','dragover']) dropZone.addEventListener(eventName,event=>{event.preventDefault();dropZone.classList.add('drag-over');});
  for(const eventName of ['dragleave','drop']) dropZone.addEventListener(eventName,event=>{event.preventDefault();dropZone.classList.remove('drag-over');});
  dropZone.addEventListener('drop',event=>loadFile(event.dataTransfer.files[0]));
  tolerance.addEventListener('input',()=>{toleranceValue.value=tolerance.value;scheduleRender();});
  sampleButton.addEventListener('click',()=>{picking=true;pickOverlay.hidden=false;sampleButton.textContent='Cancel';previewStatus.textContent='PICK A BACKGROUND COLOR';});
  canvas.addEventListener('click',event=>{
    if(!picking)return;
    const rect=canvas.getBoundingClientRect();
    const x=Math.max(0,Math.min(canvas.width-1,Math.floor((event.clientX-rect.left)*canvas.width/rect.width)));
    const y=Math.max(0,Math.min(canvas.height-1,Math.floor((event.clientY-rect.top)*canvas.height/rect.height)));
    const pixels=ctx.getImageData(x,y,1,1).data;
    picking=false;pickOverlay.hidden=true;sampleButton.textContent='Pick color';
    setBackground([pixels[0],pixels[1],pixels[2]]);
  });
  pickOverlay.addEventListener('click',()=>{picking=false;pickOverlay.hidden=true;sampleButton.textContent='Pick color';previewStatus.textContent='BACKGROUND REMOVED';});
  document.querySelector('#clearButton').addEventListener('click',()=>{
    if(sourceImage?.src?.startsWith('blob:'))URL.revokeObjectURL(sourceImage.src);
    sourceImage=null;generation++;canvas.hidden=true;emptyState.hidden=false;fileInfo.hidden=true;
    canvas.width=canvas.height=0;previewStatus.textContent='READY WHEN YOU ARE';document.querySelector('#previewDimensions').textContent='';
    tolerance.disabled=true;sampleButton.disabled=true;downloadButton.disabled=true;copyButton.disabled=true;
    document.querySelector('#canvasHint').textContent='Your image never leaves this browser.';
    sampleButton.textContent='Pick color';pickOverlay.hidden=true;picking=false;
  });
  downloadButton.addEventListener('click',()=>canvas.toBlob(blob=>{
    if(!blob)return;
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`${sourceName}-no-background.png`;link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  },'image/png'));
  copyButton.addEventListener('click',async()=>{
    if(!navigator.clipboard||typeof ClipboardItem==='undefined'){alert('Copying images is not available in this browser. Try downloading the PNG instead.');return;}
    try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);copyButton.querySelector('span').textContent='Copied!';setTimeout(()=>copyButton.querySelector('span').textContent='Copy image',1600);}
    catch{alert('Clipboard access was blocked. You can still download the PNG.');}
  });
})();
