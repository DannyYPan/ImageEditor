(() => {
  const $ = selector => document.querySelector(selector);
  const input=$('#fileInput'),dropZone=$('#dropZone'),canvas=$('#previewCanvas'),beforeCanvas=$('#beforeCanvas'),canvasStack=$('#canvasStack');
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),beforeCtx=beforeCanvas.getContext('2d');
  const panels={remove:$('#removeControls'),border:$('#borderControls'),recolor:$('#recolorControls'),crop:$('#cropControls'),convert:$('#convertControls')};
  const colorRules=[];
  let sourceImage=null,sourceName='image',sourceUrl='',currentTool='remove',background=[255,255,255],picking=false,renderTimer=0,generation=0,processedImage=null;

  function clearCurrentImage(){
    clearTimeout(renderTimer);if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl='';sourceImage=null;processedImage=null;colorRules.splice(0);
    canvas.width=canvas.height=beforeCanvas.width=beforeCanvas.height=0;canvasStack.hidden=true;$('#emptyState').hidden=false;$('#fileInfo').hidden=true;
    $('#previewStatus').textContent='READY WHEN YOU ARE';$('#previewDimensions').textContent='';$('#compareControls').hidden=true;
    $('#downloadButton').disabled=true;$('#copyButton').disabled=true;$('#tolerance').disabled=true;$('#sampleButton').disabled=true;
    $('#borderWidth').disabled=true;$('#outlineCount').disabled=true;$('#addColorButton').disabled=true;$('#colorSensitivity').disabled=true;
    $('#cropRatio').disabled=true;['#cropWidthPx','#cropHeightPx','#cropLeftPx','#cropTopPx'].forEach(id=>$(id).disabled=true);
    $('#canvasHint').textContent='Your image never leaves this browser.';$('#pickOverlay').hidden=true;picking=false;$('#sampleButton').textContent='Pick color';
    refreshColorRules();refreshOutlineColors();
  }

  function selectTool(tool){
    if(tool!==currentTool)clearCurrentImage();
    currentTool=tool;document.body.dataset.tool=tool;Object.entries(panels).forEach(([name,panel])=>panel.hidden=name!==tool);$('.tools-menu').open=false;
    const titles={remove:['A little less','background.'],border:['Make it stand out with a','border.'],recolor:['Give your colors a','new look.'],crop:['A better','frame.'],convert:['One image, many','formats.']};
    const descriptions={remove:'Make your image stand out. Remove a plain background, then take your transparent PNG anywhere.',border:'Add clean, customizable outlines that follow the visible shape of your image.',recolor:'Pick several colors and change them together, with control over nearby shades.',crop:'Choose a familiar aspect ratio or set the crop dimensions and position yourself.',convert:'Convert an image or the first page of a PDF into the format you need.'};
    $('#page-title').innerHTML=`${titles[tool][0]} <span>${titles[tool][1]}</span>`;$('.intro-copy').textContent=descriptions[tool];
  }
  document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>selectTool(button.dataset.tool)));

  const averageCorner=(data,x,y,w,h)=>{let r=0,g=0,b=0,n=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){const p=(Math.min(h-1,y+dy)*w+Math.min(w-1,x+dx))*4;if(data.data[p+3]>180){r+=data.data[p];g+=data.data[p+1];b+=data.data[p+2];n++;}}return n?[r/n,g/n,b/n]:[255,255,255];};
  function setBackground(color,label='Picked from your image'){background=color.map(Math.round);$('#sampleSwatch').style.backgroundColor=`rgb(${background.join(',')})`;$('#sampleLabel').textContent=label;if(sourceImage)scheduleRender();}
  function scheduleRender(){clearTimeout(renderTimer);$('#previewStatus').textContent='UPDATING IMAGE';renderTimer=setTimeout(render,25);}

  function render(){
    if(!sourceImage)return;const token=++generation,w=sourceImage.naturalWidth,h=sourceImage.naturalHeight;
    canvas.width=w;canvas.height=h;ctx.clearRect(0,0,w,h);ctx.drawImage(sourceImage,0,0,w,h);
    const imageData=ctx.getImageData(0,0,w,h),pixels=imageData.data;
    if(currentTool==='remove'){
      const corners=[[0,0],[Math.max(0,w-4),0],[0,Math.max(0,h-4)],[Math.max(0,w-4),Math.max(0,h-4)]].map(([x,y])=>averageCorner(imageData,x,y,w,h)).sort((a,b)=>a[0]+a[1]+a[2]-b[0]-b[1]-b[2]);
      if($('#sampleLabel').textContent==='Sampled from the corner'){background=[0,1,2].map(c=>Math.round((corners[1][c]+corners[2][c])/2));$('#sampleSwatch').style.backgroundColor=`rgb(${background.join(',')})`;}
      const tolerance=Number($('#tolerance').value),outer=tolerance+34,size=w*h,seen=new Uint8Array(size),stack=new Int32Array(size);let top=0;
      const enqueue=index=>{if(seen[index])return;const p=index*4;if(pixels[p+3]===0){seen[index]=1;return;}const dr=pixels[p]-background[0],dg=pixels[p+1]-background[1],db=pixels[p+2]-background[2];if(Math.sqrt(dr*dr+dg*dg+db*db)<=outer){seen[index]=1;stack[top++]=index;}};
      for(let x=0;x<w;x++){enqueue(x);enqueue((h-1)*w+x);}for(let y=1;y<h-1;y++){enqueue(y*w);enqueue(y*w+w-1);}
      while(top){const i=stack[--top],x=i%w,y=(i/w)|0,p=i*4,dr=pixels[p]-background[0],dg=pixels[p+1]-background[1],db=pixels[p+2]-background[2],distance=Math.sqrt(dr*dr+dg*dg+db*db);pixels[p+3]=Math.round(pixels[p+3]*Math.max(0,Math.min(1,(distance-tolerance)/(outer-tolerance))));if(x)enqueue(i-1);if(x<w-1)enqueue(i+1);if(y)enqueue(i-w);if(y<h-1)enqueue(i+w);}
    }
    if(token!==generation)return;processedImage=imageData;updateOutput();
  }

  function hexRgb(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
  function outlineDistance(mask,w,h){
    const distance=new Uint16Array(mask.length);distance.fill(65535);const coverage=new Uint8Array(mask.length);for(let i=0;i<mask.length;i++)if(mask[i]){distance[i]=0;coverage[i]=mask[i];}
    const relax=(at,from,cost)=>{const next=distance[from]+cost;if(next<distance[at]){distance[at]=next;coverage[at]=coverage[from];}};
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)relax(i,i-1,3);if(y)relax(i,i-w,3);if(x&&y)relax(i,i-w-1,4);if(x+1<w&&y)relax(i,i-w+1,4);}
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x+1<w)relax(i,i+1,3);if(y+1<h)relax(i,i+w,3);if(x+1<w&&y+1<h)relax(i,i+w+1,4);if(x&&y+1<h)relax(i,i+w-1,4);}
    return{distance,coverage};
  }

  function cropRect(w,h){
    let cw=Math.min(w,Math.max(1,Number($('#cropWidthPx').value)||w)),ch=Math.min(h,Math.max(1,Number($('#cropHeightPx').value)||h));
    const left=Math.min(w-cw,Math.max(0,Number($('#cropLeftPx').value)||0)),top=Math.min(h-ch,Math.max(0,Number($('#cropTopPx').value)||0));
    return{x:left,y:top,w:cw,h:ch};
  }
  function updateOutput(){
    if(!processedImage)return;const w=processedImage.width,h=processedImage.height;
    const output=new ImageData(new Uint8ClampedArray(processedImage.data),w,h),pixels=output.data;
    if(currentTool==='recolor'){
      const sensitivity=Number($('#colorSensitivity').value),rules=colorRules.map(rule=>({from:rule.from,to:hexRgb(rule.to)}));
      for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;let best=null,distanceLimit=sensitivity;for(const rule of rules){const dr=pixels[i]-rule.from[0],dg=pixels[i+1]-rule.from[1],db=pixels[i+2]-rule.from[2],d=Math.sqrt(dr*dr+dg*dg+db*db);if(d<=distanceLimit){distanceLimit=d;best=rule;}}if(best){pixels[i]=best.to[0];pixels[i+1]=best.to[1];pixels[i+2]=best.to[2];}}
    }
    const border=currentTool==='border',weight=Number($('#borderWidth').value),count=Number($('#outlineCount').value),padding=border?weight*count:0,outW=w+padding*2,outH=h+padding*2;
    const work=document.createElement('canvas');work.width=outW;work.height=outH;const workCtx=work.getContext('2d',{willReadFrequently:true});
    if(border){
      const total=outW*outH,mask=new Uint8Array(total);for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[(y+padding)*outW+x+padding]=pixels[(y*w+x)*4+3];
      const {distance,coverage}=outlineDistance(mask,outW,outH),colors=Array.from({length:count},(_,i)=>hexRgb($(`#outlineColor${i}`)?.value||'#ffffff')),layer=workCtx.createImageData(outW,outH),lp=layer.data,band=weight*3;
      for(let i=0;i<total;i++){const d=distance[i];if(!d||d>band*count||!coverage[i])continue;const ring=Math.min(count-1,Math.floor((d-1)/band)),p=i*4,color=colors[ring];lp[p]=color[0];lp[p+1]=color[1];lp[p+2]=color[2];lp[p+3]=coverage[i];}workCtx.putImageData(layer,0,0);
    }
    if(border){const sourceLayer=document.createElement('canvas');sourceLayer.width=w;sourceLayer.height=h;sourceLayer.getContext('2d').putImageData(output,0,0);workCtx.drawImage(sourceLayer,padding,padding);}
    else workCtx.putImageData(output,0,0);
    let sx=0,sy=0,sw=outW,sh=outH;
    if(currentTool==='crop'){const crop=cropRect(w,h);sx=crop.x;sy=crop.y;sw=crop.w;sh=crop.h;}
    const finalData=workCtx.getImageData(sx,sy,sw,sh);canvas.width=sw;canvas.height=sh;ctx.putImageData(finalData,0,0);
    beforeCanvas.width=sw;beforeCanvas.height=sh;beforeCtx.clearRect(0,0,sw,sh);
    if(currentTool==='crop')beforeCtx.drawImage(sourceImage,sx,sy,sw,sh,0,0,sw,sh);
    else if(border)beforeCtx.drawImage(sourceImage,padding,padding,w,h);
    else beforeCtx.drawImage(sourceImage,0,0,sw,sh);
    canvasStack.hidden=false;$('#emptyState').hidden=true;$('#compareControls').hidden=false;updateComparison();
    $('#previewDimensions').textContent=`${sw} × ${sh} px`;$('#previewStatus').textContent=({remove:'BACKGROUND REMOVED',border:'BORDER ADDED',recolor:colorRules.length?'COLORS CHANGED':'IMAGE READY',crop:'IMAGE CROPPED',convert:'IMAGE READY'})[currentTool];
    $('#downloadButton').disabled=false;$('#copyButton').disabled=false;
  }

  function updateComparison(){const amount=Number($('#compareRange').value),divider=$('#compareDivider'),canvasRect=canvas.getBoundingClientRect(),stackRect=canvasStack.getBoundingClientRect();canvas.style.clipPath=`inset(0 ${100-amount}% 0 0)`;divider.style.left=`${canvasRect.left-stackRect.left+canvasRect.width*amount/100}px`;divider.style.top=`${canvasRect.top-stackRect.top}px`;divider.style.height=`${canvasRect.height}px`;divider.style.bottom='auto';}
  function refreshOutlineColors(){const count=Number($('#outlineCount').value),container=$('#outlineColors'),old=Array.from(container.querySelectorAll('input')).map(input=>input.value);$('#outlineCountValue').value=count;container.replaceChildren();for(let i=0;i<count;i++){const label=document.createElement('label');label.className='outline-color';label.innerHTML=`<span>Outline ${i+1}</span>`;const color=document.createElement('input');color.type='color';color.id=`outlineColor${i}`;color.value=old[i]||'#ffffff';color.disabled=!sourceImage;color.addEventListener('input',updateOutput);label.append(color);container.append(label);}}
  function refreshColorRules(){const container=$('#colorRules');container.replaceChildren();if(!colorRules.length){const p=document.createElement('p');p.className='empty-rules';p.textContent='No colors selected yet.';container.append(p);return;}colorRules.forEach((rule,index)=>{const row=document.createElement('div');row.className='color-rule';const original=document.createElement('span');original.className='rule-chip';original.style.backgroundColor=`rgb(${rule.from.join(',')})`;const arrow=document.createElement('span');arrow.className='rule-arrow';arrow.textContent='→';const target=document.createElement('input');target.type='color';target.value=rule.to;target.setAttribute('aria-label',`Replacement color ${index+1}`);target.addEventListener('input',()=>{rule.to=target.value;updateOutput();});const remove=document.createElement('button');remove.type='button';remove.className='icon-button';remove.textContent='×';remove.setAttribute('aria-label',`Remove color ${index+1}`);remove.addEventListener('click',()=>{colorRules.splice(index,1);refreshColorRules();updateOutput();});row.append(original,arrow,target,remove);container.append(row);});}

  function updateCropRatio(){if(!sourceImage)return;const mode=$('#cropRatio').value,w=sourceImage.naturalWidth,h=sourceImage.naturalHeight;$('#cropCustom').hidden=mode!=='custom';if(mode!=='free'){let rw,rh;if(mode==='custom'){rw=Math.max(1,Number($('#cropRatioW').value)||1);rh=Math.max(1,Number($('#cropRatioH').value)||1);}else[rw,rh]=mode.split(':').map(Number);let cw,ch;if(w/h>rw/rh){ch=h;cw=Math.round(h*rw/rh);}else{cw=w;ch=Math.round(w*rh/rw);}$('#cropWidthPx').value=cw;$('#cropHeightPx').value=ch;$('#cropLeftPx').value=Math.floor((w-cw)/2);$('#cropTopPx').value=Math.floor((h-ch)/2);}scheduleRender();}
  function updateManualCrop(){if(!sourceImage)return;const w=sourceImage.naturalWidth,h=sourceImage.naturalHeight;let cw=Math.min(w,Math.max(1,Number($('#cropWidthPx').value)||w)),ch=Math.min(h,Math.max(1,Number($('#cropHeightPx').value)||h));$('#cropWidthPx').value=cw;$('#cropHeightPx').value=ch;$('#cropLeftPx').value=Math.min(w-cw,Math.max(0,Number($('#cropLeftPx').value)||0));$('#cropTopPx').value=Math.min(h-ch,Math.max(0,Number($('#cropTopPx').value)||0));scheduleRender();}

  async function renderPdf(file){
    const version='4.10.38',base=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/`;
    const pdfjs=await import(`${base}pdf.min.mjs`);pdfjs.GlobalWorkerOptions.workerSrc=`${base}pdf.worker.min.mjs`;
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,page=await pdf.getPage(1),baseViewport=page.getViewport({scale:1});
    const scale=Math.min(2,4000/Math.max(baseViewport.width,baseViewport.height)),viewport=page.getViewport({scale}),pdfCanvas=document.createElement('canvas');
    pdfCanvas.width=Math.ceil(viewport.width);pdfCanvas.height=Math.ceil(viewport.height);await page.render({canvasContext:pdfCanvas.getContext('2d'),viewport}).promise;
    return pdfCanvas.toDataURL('image/png');
  }

  function loadImageUrl(url,name,blobUrl=''){
    const image=new Image();image.onload=()=>{
      if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=blobUrl;sourceImage=image;sourceName=name.replace(/\.[^.]+$/,'')||'image';colorRules.splice(0);$('#fileInfo').hidden=false;$('#emptyState').hidden=true;canvasStack.hidden=false;
      $('#fileName').textContent=name;$('#fileDimensions').textContent=`${image.naturalWidth} × ${image.naturalHeight} px`;$('#fileThumb').style.backgroundImage=`url("${url}")`;
      $('#canvasHint').textContent='Drag the comparison slider to see before and after.';$('#tolerance').disabled=false;$('#sampleButton').disabled=false;$('#borderWidth').disabled=false;$('#outlineCount').disabled=false;$('#addColorButton').disabled=false;$('#colorSensitivity').disabled=false;
      $('#cropRatio').disabled=false;['#cropWidthPx','#cropHeightPx','#cropLeftPx','#cropTopPx'].forEach(id=>$(id).disabled=false);
      $('#cropRatio').value='free';$('#cropCustom').hidden=true;$('#cropWidthPx').value=image.naturalWidth;$('#cropHeightPx').value=image.naturalHeight;$('#cropLeftPx').value=0;$('#cropTopPx').value=0;$('#compareRange').value=50;
      refreshOutlineColors();refreshColorRules();setBackground([255,255,255],'Sampled from the corner');scheduleRender();
    };
    image.onerror=()=>{if(blobUrl)URL.revokeObjectURL(blobUrl);alert('This image could not be opened. Please try another file.');};image.src=url;
  }
  async function loadFile(file){
    if(!file)return;const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isImage=/^image\/(jpeg|png|webp)$/.test(file.type)||/\.(jpe?g|png|webp)$/i.test(file.name);
    if(!isPdf&&!isImage){alert('Choose a JPG, PNG, WebP, or PDF file.');return;}if(file.size>25*1024*1024){alert('This file is larger than 25 MB. Please choose a smaller file.');return;}
    if(isPdf){$('#previewStatus').textContent='CONVERTING PDF PAGE';try{const dataUrl=await renderPdf(file);loadImageUrl(dataUrl,file.name);}catch(error){console.error(error);alert('This PDF could not be opened. Check your internet connection and try again.');$('#previewStatus').textContent='READY WHEN YOU ARE';}return;}
    const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{if(image.naturalWidth*image.naturalHeight>16000000){URL.revokeObjectURL(url);alert('This image has too many pixels to process smoothly. Please use an image under 16 megapixels.');return;}loadImageUrl(url,file.name,url);};image.onerror=()=>{URL.revokeObjectURL(url);alert('This image could not be opened. Please try another file.');};image.src=url;
  }

  function bytes(text){return new TextEncoder().encode(text);}
  function makePdf(){
    const w=canvas.width,h=canvas.height,flat=document.createElement('canvas');flat.width=w;flat.height=h;const flatCtx=flat.getContext('2d');flatCtx.fillStyle='#fff';flatCtx.fillRect(0,0,w,h);flatCtx.drawImage(canvas,0,0);const jpeg=flat.toDataURL('image/jpeg',.94),binary=atob(jpeg.split(',')[1]),imageBytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)imageBytes[i]=binary.charCodeAt(i);
    const content=bytes(`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ`),objects=[bytes('<< /Type /Catalog /Pages 2 0 R >>'),bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),null,bytes(`<< /Length ${content.length} >>\nstream\n${new TextDecoder().decode(content)}\nendstream`)];
    objects[3]=[bytes(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`),imageBytes,bytes('\nendstream')];
    const parts=[new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10])],offsets=[0];let length=parts[0].length;
    for(let i=0;i<objects.length;i++){offsets.push(length);parts.push(bytes(`${i+1} 0 obj\n`));length+=parts.at(-1).length;const body=Array.isArray(objects[i])?objects[i]:[objects[i]];for(const part of body){parts.push(part);length+=part.length;}parts.push(bytes('\nendobj\n'));length+=parts.at(-1).length;}
    const xref=length;let table=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)table+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;parts.push(bytes(table+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));return new Blob(parts,{type:'application/pdf'});
  }
  async function exportImage(){
    const mime=$('#exportFormat').value,ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','application/pdf':'pdf'}[mime];let blob;
    if(mime==='application/pdf')blob=makePdf();
    else if(mime==='image/svg+xml'){const data=canvas.toDataURL('image/png'),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="100%" height="100%" href="${data}"/></svg>`;blob=new Blob([svg],{type:mime});}
    else blob=await new Promise(resolve=>{if(mime==='image/jpeg'){const flat=document.createElement('canvas');flat.width=canvas.width;flat.height=canvas.height;const flatCtx=flat.getContext('2d');flatCtx.fillStyle='#fff';flatCtx.fillRect(0,0,flat.width,flat.height);flatCtx.drawImage(canvas,0,0);flat.toBlob(resolve,mime,.94);}else canvas.toBlob(resolve,mime,.94);});
    if(!blob||((mime==='image/webp'||mime==='image/jpeg')&&blob.type!==mime)){alert('This format is not supported by your browser.');return;}const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=`${sourceName}-keystone.${ext}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  input.addEventListener('change',()=>{loadFile(input.files[0]);input.value='';});
  document.addEventListener('paste',event=>{const item=Array.from(event.clipboardData?.items||[]).find(entry=>entry.kind==='file'&&/^image\/(png|jpeg|webp)$/.test(entry.type));if(item){const file=item.getAsFile();if(file){event.preventDefault();loadFile(file);}}});
  dropZone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}});
  for(const name of ['dragenter','dragover'])dropZone.addEventListener(name,event=>{event.preventDefault();dropZone.classList.add('drag-over');});for(const name of ['dragleave','drop'])dropZone.addEventListener(name,event=>{event.preventDefault();dropZone.classList.remove('drag-over');});dropZone.addEventListener('drop',event=>loadFile(event.dataTransfer.files[0]));
  $('#tolerance').addEventListener('input',()=>{$('#toleranceValue').value=$('#tolerance').value;scheduleRender();});$('#compareRange').addEventListener('input',updateComparison);window.addEventListener('resize',()=>{if(sourceImage)updateComparison();});
  $('#sampleButton').addEventListener('click',()=>{picking=true;$('#pickOverlay').textContent='Click a background color to sample it';$('#pickOverlay').hidden=false;$('#sampleButton').textContent='Cancel';});
  $('#addColorButton').addEventListener('click',()=>{picking=true;$('#pickOverlay').textContent='Click the color you want to replace';$('#pickOverlay').hidden=false;});
  canvas.addEventListener('click',event=>{if(!picking)return;const rect=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(canvas.width-1,Math.floor((event.clientX-rect.left)*canvas.width/rect.width))),y=Math.max(0,Math.min(canvas.height-1,Math.floor((event.clientY-rect.top)*canvas.height/rect.height)));if(currentTool==='recolor'){const p=(y*processedImage.width+x)*4,data=processedImage.data;if(data[p+3]<16)return;colorRules.push({from:[data[p],data[p+1],data[p+2]],to:'#ff6b6b'});refreshColorRules();}else{const data=ctx.getImageData(x,y,1,1).data;setBackground([data[0],data[1],data[2]]);}picking=false;$('#pickOverlay').hidden=true;$('#sampleButton').textContent='Pick color';if(currentTool==='recolor')updateOutput();});
  $('#pickOverlay').addEventListener('click',()=>{picking=false;$('#pickOverlay').hidden=true;$('#sampleButton').textContent='Pick color';});
  $('#borderWidth').addEventListener('input',()=>{$('#borderWidthValue').value=`${$('#borderWidth').value} px`;refreshOutlineColors();updateOutput();});$('#outlineCount').addEventListener('input',()=>{refreshOutlineColors();updateOutput();});$('#colorSensitivity').addEventListener('input',updateOutput);
  $('#cropRatio').addEventListener('change',updateCropRatio);$('#cropRatioW').addEventListener('input',()=>{if($('#cropRatio').value==='custom')updateCropRatio();});$('#cropRatioH').addEventListener('input',()=>{if($('#cropRatio').value==='custom')updateCropRatio();});
  ['#cropWidthPx','#cropHeightPx','#cropLeftPx','#cropTopPx'].forEach(id=>$(id).addEventListener('input',()=>{if($('#cropRatio').value!=='free')$('#cropRatio').value='free';updateManualCrop();}));
  $('#clearButton').addEventListener('click',clearCurrentImage);$('#downloadButton').addEventListener('click',exportImage);
  $('#copyButton').addEventListener('click',async()=>{if(!navigator.clipboard||typeof ClipboardItem==='undefined'){alert('Copying images is unavailable in this browser.');return;}try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);$('#copyButton span').textContent='Copied!';setTimeout(()=>$('#copyButton span').textContent='Copy PNG',1500);}catch{alert('Clipboard access was blocked.');}});
})();
