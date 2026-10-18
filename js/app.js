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
  const toolPanels = { remove: document.querySelector('#removeControls'), border: document.querySelector('#borderControls'), recolor: document.querySelector('#recolorControls') };
  const borderEnabled = document.querySelector('#borderEnabled');
  const borderWidth = document.querySelector('#borderWidth');
  const outlineCount = document.querySelector('#outlineCount');
  const previewButton = document.querySelector('#previewButton');
  const colorRules = [];
  let processedImage = null;
  let previewed = false;
  let backgroundRemovalEnabled = false;
  let currentTool = 'remove';
  let pickingReplacement = false;
  let sourceImage = null;
  let sourceName = 'image';
  let background = [255, 255, 255];
  let picking = false;
  let renderTimer = 0;
  let generation = 0;

  function clearCurrentImage() {
    clearTimeout(renderTimer);
    if(sourceImage?.src?.startsWith('blob:'))URL.revokeObjectURL(sourceImage.src);
    sourceImage=null;processedImage=null;previewed=false;backgroundRemovalEnabled=false;colorRules.splice(0);
    canvas.width=canvas.height=0;canvas.hidden=true;emptyState.hidden=false;fileInfo.hidden=true;
    previewStatus.textContent='READY WHEN YOU ARE';document.querySelector('#previewDimensions').textContent='';
    document.querySelector('#canvasHint').textContent='Your image never leaves this browser.';
    tolerance.disabled=true;sampleButton.disabled=true;downloadButton.disabled=true;copyButton.disabled=true;previewButton.disabled=true;
    borderEnabled.checked=false;borderEnabled.disabled=true;borderWidth.disabled=true;outlineCount.disabled=true;
    document.querySelector('#addColorButton').disabled=true;document.querySelector('#colorSensitivity').disabled=true;
    sampleButton.textContent='Pick color';pickOverlay.hidden=true;picking=false;pickingReplacement=false;
    refreshColorRules();refreshOutlineColors();
  }

  function selectTool(tool) {
    if(tool!==currentTool)clearCurrentImage();
    currentTool = tool;
    document.body.dataset.tool = tool;
    Object.entries(toolPanels).forEach(([name, panel]) => { panel.hidden = name !== tool; });
    document.querySelector('.tools-menu').open = false;
    const titles = { remove: 'A little less', border: 'Make it stand out with a', recolor: 'Give your colors a' };
    const endings = { remove: 'background.', border: 'border.', recolor: 'new look.' };
    document.querySelector('#page-title').innerHTML = `${titles[tool]} <span>${endings[tool]}</span>`;
    document.querySelector('.intro-copy').textContent = ({remove:'Make your image stand out. Remove a plain background, then take your transparent PNG anywhere.',border:'Add clean, customizable outlines that follow the visible shape of your image.',recolor:'Pick several colors and change them together, with control over how many nearby shades are included.'})[tool];
    if (processedImage) updateOutput();
  }

  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => selectTool(button.dataset.tool)));

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
    if(backgroundRemovalEnabled){
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
    }
    if(currentGeneration !== generation) return;
    processedImage = imageData;
    updateOutput();
  }

  function hexRgb(hex) { return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]; }

  function outlineDistance(mask, width, height) {
    const distance=new Uint16Array(mask.length);distance.fill(65535);
    const coverage=new Uint8Array(mask.length);
    for(let i=0;i<mask.length;i++)if(mask[i]){distance[i]=0;coverage[i]=mask[i];}
    const relax=(at,from,cost)=>{const next=distance[from]+cost;if(next<distance[at]){distance[at]=next;coverage[at]=coverage[from];}};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;
      if(x>0)relax(i,i-1,3);if(y>0)relax(i,i-width,3);
      if(x>0&&y>0)relax(i,i-width-1,4);if(x+1<width&&y>0)relax(i,i-width+1,4);
    }
    for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
      const i=y*width+x;
      if(x+1<width)relax(i,i+1,3);if(y+1<height)relax(i,i+width,3);
      if(x+1<width&&y+1<height)relax(i,i+width+1,4);if(x>0&&y+1<height)relax(i,i+width-1,4);
    }
    return {distance,coverage};
  }

  function updateOutput() {
    if(!processedImage)return;
    const w=processedImage.width,h=processedImage.height;
    if(!previewed){
      canvas.width=w;canvas.height=h;ctx.putImageData(processedImage,0,0);
      document.querySelector('#previewDimensions').textContent=`${w} × ${h} px`;
      previewStatus.textContent='IMAGE READY · PREVIEW TO APPLY EFFECTS';
      downloadButton.disabled=true;copyButton.disabled=true;return;
    }
    const recolored=new ImageData(new Uint8ClampedArray(processedImage.data),w,h);
    const pixels=recolored.data;
    const sensitivity=Number(document.querySelector('#colorSensitivity').value);
    const rules=colorRules.map(rule=>({from:rule.from,to:hexRgb(rule.to)}));
    if(rules.length){
      for(let i=0;i<pixels.length;i+=4){
        if(!pixels[i+3])continue;
        let best=null,bestDistance=sensitivity;
        for(const rule of rules){const dr=pixels[i]-rule.from[0],dg=pixels[i+1]-rule.from[1],db=pixels[i+2]-rule.from[2],distance=Math.sqrt(dr*dr+dg*dg+db*db);if(distance<=bestDistance){bestDistance=distance;best=rule;}}
        if(best){pixels[i]=best.to[0];pixels[i+1]=best.to[1];pixels[i+2]=best.to[2];}
      }
    }
    const enabled=borderEnabled.checked;
    const weight=Number(borderWidth.value),count=Number(outlineCount.value),padding=enabled?weight*count:0;
    const outWidth=w+padding*2,outHeight=h+padding*2;
    canvas.width=outWidth;canvas.height=outHeight;
    if(enabled){
      const total=outWidth*outHeight,mask=new Uint8Array(total);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[(y+padding)*outWidth+x+padding]=pixels[(y*w+x)*4+3];
      const {distance,coverage}=outlineDistance(mask,outWidth,outHeight);
      const colors=Array.from({length:count},(_,ring)=>hexRgb(document.querySelector(`#outlineColor${ring}`)?.value||'#ffffff'));
      const layer=ctx.createImageData(outWidth,outHeight),layerPixels=layer.data,band=weight*3;
      for(let i=0;i<total;i++){
        const d=distance[i];if(d===0||d>band*count||!coverage[i])continue;
        const ring=Math.min(count-1,Math.floor((d-1)/band)),p=i*4,color=colors[ring];
        layerPixels[p]=color[0];layerPixels[p+1]=color[1];layerPixels[p+2]=color[2];layerPixels[p+3]=coverage[i];
      }
      ctx.putImageData(layer,0,0);
    } else ctx.clearRect(0,0,outWidth,outHeight);
    ctx.putImageData(recolored,padding,padding);
    document.querySelector('#previewDimensions').textContent=`${outWidth} × ${outHeight} px`;
    previewStatus.textContent=enabled?'BORDER ADDED':(rules.length?'COLORS UPDATED':'BACKGROUND REMOVED');
    downloadButton.disabled=false;copyButton.disabled=false;
  }

  function refreshOutlineColors() {
    const count=Number(outlineCount.value);
    document.querySelector('#outlineCountValue').value=count;
    const container=document.querySelector('#outlineColors');
    const old=Array.from(container.querySelectorAll('input')).map(input=>input.value);
    container.replaceChildren();
    for(let i=0;i<count;i++){
      const label=document.createElement('label');label.className='outline-color';label.innerHTML=`<span>Outline ${i+1}</span>`;
      const color=document.createElement('input');color.type='color';color.id=`outlineColor${i}`;color.value=old[i]||'#ffffff';color.disabled=!sourceImage;
      color.addEventListener('input',updateOutput);label.append(color);container.append(label);
    }
  }

  function refreshColorRules() {
    const container=document.querySelector('#colorRules');container.replaceChildren();
    if(!colorRules.length){const empty=document.createElement('p');empty.className='empty-rules';empty.textContent='No colors selected yet.';container.append(empty);return;}
    colorRules.forEach((rule,index)=>{
      const row=document.createElement('div');row.className='color-rule';
      const original=document.createElement('span');original.className='rule-chip';original.style.backgroundColor=`rgb(${rule.from.join(',')})`;original.title=`Original color ${rule.from.join(', ')}`;
      const arrow=document.createElement('span');arrow.className='rule-arrow';arrow.textContent='→';
      const target=document.createElement('input');target.type='color';target.value=rule.to;target.setAttribute('aria-label',`Replacement color ${index+1}`);target.addEventListener('input',()=>{rule.to=target.value;updateOutput();});
      const remove=document.createElement('button');remove.type='button';remove.className='icon-button';remove.textContent='×';remove.setAttribute('aria-label',`Remove color ${index+1}`);remove.addEventListener('click',()=>{colorRules.splice(index,1);refreshColorRules();updateOutput();});
      row.append(original,arrow,target,remove);container.append(row);
    });
  }

  function loadFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) { alert('Please choose a JPEG or PNG image.'); return; }
    if (file.size > 25*1024*1024) { alert('This image is larger than 25 MB. Please choose a smaller file.'); return; }
    const url=URL.createObjectURL(file), image=new Image();
    image.onload=()=>{
      if(image.naturalWidth*image.naturalHeight>16000000){URL.revokeObjectURL(url);alert('This image has too many pixels to process smoothly in your browser. Please use an image under 16 megapixels.');return;}
      if(sourceImage?.src?.startsWith('blob:')) URL.revokeObjectURL(sourceImage.src);
      colorRules.splice(0);borderEnabled.checked=false;picking=false;pickingReplacement=false;pickOverlay.hidden=true;
      previewed=false;backgroundRemovalEnabled=false;
      sourceImage=image; sourceName=file.name.replace(/\.[^.]+$/,'')||'image';
      canvas.hidden=false; emptyState.hidden=true;
      fileInfo.hidden=false;
      document.querySelector('#fileName').textContent=file.name;
      document.querySelector('#fileDimensions').textContent=`${image.naturalWidth} × ${image.naturalHeight} px`;
      document.querySelector('#fileThumb').style.backgroundImage=`url("${url}")`;
      document.querySelector('#previewDimensions').textContent=`${image.naturalWidth} × ${image.naturalHeight} px`;
      document.querySelector('#canvasHint').textContent='Adjust tolerance or sample another color.';
      tolerance.disabled=false; sampleButton.disabled=false;previewButton.disabled=false;
      borderEnabled.disabled=false;borderWidth.disabled=false;outlineCount.disabled=false;
      document.querySelector('#addColorButton').disabled=false;document.querySelector('#colorSensitivity').disabled=false;
      refreshOutlineColors();refreshColorRules();
      setBackground([255,255,255],'Sampled from the corner');
      scheduleRender();
    };
    image.onerror=()=>{URL.revokeObjectURL(url);alert('This image could not be opened. Please try another file.');};
    image.src=url;
  }

  input.addEventListener('change',()=>{loadFile(input.files[0]);input.value='';});
  document.addEventListener('paste',event=>{
    const items=Array.from(event.clipboardData?.items||[]);
    const imageItem=items.find(item=>item.kind==='file'&&/^image\/(png|jpeg)$/.test(item.type));
    if(!imageItem)return;
    const file=imageItem.getAsFile();if(!file)return;
    event.preventDefault();loadFile(new File([file],file.name||`pasted-image.${imageItem.type==='image/png'?'png':'jpg'}`,{type:imageItem.type}));
  });
  dropZone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}});
  for(const eventName of ['dragenter','dragover']) dropZone.addEventListener(eventName,event=>{event.preventDefault();dropZone.classList.add('drag-over');});
  for(const eventName of ['dragleave','drop']) dropZone.addEventListener(eventName,event=>{event.preventDefault();dropZone.classList.remove('drag-over');});
  dropZone.addEventListener('drop',event=>loadFile(event.dataTransfer.files[0]));
  tolerance.addEventListener('input',()=>{toleranceValue.value=tolerance.value;scheduleRender();});
  previewButton.addEventListener('click',()=>{if(!sourceImage)return;previewed=true;backgroundRemovalEnabled=currentTool==='remove';scheduleRender();});
  sampleButton.addEventListener('click',()=>{picking=true;pickingReplacement=false;pickOverlay.textContent='Click a background color to sample it';pickOverlay.hidden=false;sampleButton.textContent='Cancel';previewStatus.textContent='PICK A BACKGROUND COLOR';});
  document.querySelector('#addColorButton').addEventListener('click',()=>{picking=true;pickingReplacement=true;pickOverlay.textContent='Click the color you want to replace';pickOverlay.hidden=false;previewStatus.textContent='PICK A COLOR TO REPLACE';});
  canvas.addEventListener('click',event=>{
    if(!picking)return;
    const rect=canvas.getBoundingClientRect();
    const x=Math.max(0,Math.min(canvas.width-1,Math.floor((event.clientX-rect.left)*canvas.width/rect.width)));
    const y=Math.max(0,Math.min(canvas.height-1,Math.floor((event.clientY-rect.top)*canvas.height/rect.height)));
    if(pickingReplacement){
      const padding=previewed&&borderEnabled.checked?Number(borderWidth.value)*Number(outlineCount.value):0;
      const sx=x-padding,sy=y-padding;
      if(sx<0||sy<0||sx>=processedImage.width||sy>=processedImage.height){return;}
      const p=(sy*processedImage.width+sx)*4,pixels=processedImage.data;
      if(pixels[p+3]<16)return;
      colorRules.push({from:[pixels[p],pixels[p+1],pixels[p+2]],to:'#ff6b6b'});refreshColorRules();
    } else {
      const pixels=ctx.getImageData(x,y,1,1).data;
      sampleButton.textContent='Pick color';setBackground([pixels[0],pixels[1],pixels[2]]);
    }
    picking=false;pickOverlay.hidden=true;
    if(pickingReplacement) updateOutput();
  });
  pickOverlay.addEventListener('click',()=>{picking=false;pickingReplacement=false;pickOverlay.hidden=true;sampleButton.textContent='Pick color';previewStatus.textContent='BACKGROUND REMOVED';});
  borderEnabled.addEventListener('change',updateOutput);
  borderWidth.addEventListener('input',()=>{document.querySelector('#borderWidthValue').value=`${borderWidth.value} px`;refreshOutlineColors();updateOutput();});
  outlineCount.addEventListener('input',()=>{document.querySelector('#outlineCountValue').value=outlineCount.value;refreshOutlineColors();updateOutput();});
  document.querySelector('#colorSensitivity').addEventListener('input',event=>{document.querySelector('#colorSensitivityValue').value=event.target.value;updateOutput();});
  document.querySelector('#clearButton').addEventListener('click',clearCurrentImage);
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
