(() => {
  const $ = selector => document.querySelector(selector);
  const input=$('#fileInput'),dropZone=$('#dropZone'),canvas=$('#previewCanvas'),beforeCanvas=$('#beforeCanvas'),canvasStack=$('#canvasStack');
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),beforeCtx=beforeCanvas.getContext('2d');
  const panels={remove:$('#removeControls'),border:$('#borderControls'),recolor:$('#recolorControls'),crop:$('#cropControls'),resize:$('#resizeControls'),convert:$('#convertControls')};
  const toolHome=$('#toolHome'),editorView=$('#editorView');
  const colorRules=[];
  let activePage='home',pageTransitionTimer=0,toolTransitionTimer=0,toolTransitionToken=0;
  let sourceImage=null,sourcePixels=null,beforeKey='',sourceName='image',sourceUrl='',pdfFileName='',pdfPageIndex=0,pdfPageRequest=0,currentTool='remove',background=[255,255,255],picking=false,renderTimer=0,generation=0,processedImage=null,pdfPages=null,backgroundRemovalFound=true,comparisonState='after',resizeRatio=1,previewZoom=1,zoomPanX=0,zoomPanY=0;

  function clearCurrentImage(){
    clearTimeout(renderTimer);if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl='';sourceImage=null;sourcePixels=null;beforeKey='';processedImage=null;pdfPages=null;pdfFileName='';pdfPageIndex=0;pdfPageRequest++;colorRules.splice(0);
    canvas.width=canvas.height=beforeCanvas.width=beforeCanvas.height=0;canvasStack.hidden=true;$('#emptyState').hidden=false;$('#fileInfo').hidden=true;
    $('#previewStatus').textContent='READY WHEN YOU ARE';$('#previewDimensions').textContent='';$('#compareControls').hidden=true;$('#pdfPageControls').hidden=true;$('#pdfPageSlider').disabled=true;
    $('#zoomControls').hidden=true;setZoom(1);
    $('#downloadButton').disabled=true;$('#copyButton').disabled=true;$('#tolerance').disabled=true;$('#toleranceNumber').disabled=true;$('#sampleButton').disabled=true;$('#backgroundColor').disabled=true;$('#backgroundHex').disabled=true;$('#removalMode').disabled=true;
    $('#borderWidth').disabled=true;$('#borderWidthNumber').disabled=true;$('#outlineCount').disabled=true;$('#outlineCountNumber').disabled=true;$('#addColorButton').disabled=true;$('#colorSensitivity').disabled=true;$('#colorSensitivityNumber').disabled=true;$('#keepGradients').disabled=true;
    $('#cropRatio').disabled=true;$('#smartCropButton').disabled=true;$('#resizeWidth').disabled=true;$('#resizeHeight').disabled=true;$('#lockResizeRatio').disabled=true;$('#smoothResize').disabled=true;['#cropWidthPx','#cropHeightPx','#cropLeftPx','#cropTopPx','#cropWidthInput','#cropHeightInput'].forEach(id=>$(id).disabled=true);
    $('#canvasHint').textContent='Your image never leaves this browser.';$('#pickOverlay').hidden=true;picking=false;$('#sampleButton').textContent='Pick color';
    refreshColorRules();refreshOutlineColors();
  }

  function selectTool(tool){
    const previousTool=currentTool;
    if(tool!==previousTool)clearCurrentImage();
    currentTool=tool;document.body.dataset.tool=tool;
    if(previousTool!==tool)transitionToolPanel(panels[tool],panels[previousTool]);
    if(activePage!=='editor'){activePage='editor';transitionPageView(editorView,toolHome);}
    $('.tools-menu').hidden=false;$('.tools-menu').open=false;
    const titles={remove:['Background','remover'],border:['Border','maker'],recolor:['Color','replacer'],crop:['Image','cropper'],resize:['Image','resizer'],convert:['Image','converter']};
    const descriptions={remove:'Remove matching background colors throughout the image, including enclosed areas.',border:'Add outlines that follow the visible shape of the image.',recolor:'Replace colors and control how nearby shades are matched.',crop:'Choose an aspect ratio, then move and resize the crop frame.',resize:'Set output dimensions and choose how the image is resampled.',convert:'Convert images or browse pages in a PDF.'};
    $('#page-title').innerHTML=`${titles[tool][0]} <span>${titles[tool][1]}</span>`;$('.intro-copy').textContent=descriptions[tool];
  }
  document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>selectTool(button.dataset.tool)));
  $('.brand').addEventListener('click',event=>{event.preventDefault();if(activePage==='home')return;activePage='home';clearCurrentImage();$('.tools-menu').open=false;$('.tools-menu').hidden=true;transitionPageView(toolHome,editorView);});

  const averageCorner=(data,x,y,w,h)=>{let r=0,g=0,b=0,n=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){const p=(Math.min(h-1,y+dy)*w+Math.min(w-1,x+dx))*4;if(data.data[p+3]>180){r+=data.data[p];g+=data.data[p+1];b+=data.data[p+2];n++;}}return n?[r/n,g/n,b/n]:[255,255,255];};
  function rgbToHex(color){return '#'+color.map(value=>Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,'0')).join('');}
  function syncBackgroundControls(){const hex=rgbToHex(background);$('#sampleSwatch').style.backgroundColor=`rgb(${background.join(',')})`;$('#backgroundColor').value=hex;if(document.activeElement!==$('#backgroundHex'))$('#backgroundHex').value=hex;}
  function setBackground(color,label='Picked from your image'){background=color.map(Math.round);syncBackgroundControls();$('#sampleLabel').textContent=label;if(sourceImage)scheduleRender();}
  function scheduleRender(delay=100){clearTimeout(renderTimer);$('#previewStatus').textContent='UPDATING IMAGE';renderTimer=setTimeout(()=>requestAnimationFrame(render),delay);}
  function setZoom(value){previewZoom=Math.max(1,Math.min(4,value));if(previewZoom===1)zoomPanX=zoomPanY=0;canvasStack.style.transform=`translate(${zoomPanX}px,${zoomPanY}px) scale(${previewZoom})`;canvasStack.classList.toggle('zoomed',previewZoom>1);$('#zoomLabel').textContent=previewZoom===1?'Fit':`${Math.round(previewZoom*100)}%`;$('#zoomOut').disabled=!sourceImage||previewZoom<=1;$('#zoomIn').disabled=!sourceImage||previewZoom>=4;$('#zoomFit').disabled=!sourceImage||previewZoom===1;if(sourceImage)$('#canvasHint').textContent=previewZoom>1&&currentTool!=='crop'?'Drag the image to pan · Export size is unchanged':currentTool==='crop'?'Drag the crop frame to reposition it.':'Drag the comparison slider to see before and after.';}
  function panZoom(dx,dy){const rect=$('#canvasWrap').getBoundingClientRect(),maxX=Math.max(0,(canvasStack.offsetWidth*previewZoom-rect.width)/2),maxY=Math.max(0,(canvasStack.offsetHeight*previewZoom-rect.height)/2);zoomPanX=Math.max(-maxX,Math.min(maxX,zoomPanX+dx));zoomPanY=Math.max(-maxY,Math.min(maxY,zoomPanY+dy));canvasStack.style.transform=`translate(${zoomPanX}px,${zoomPanY}px) scale(${previewZoom})`;}

  function transitionPageView(show,hide){
    clearTimeout(pageTransitionTimer);show.hidden=false;hide.hidden=false;
    show.classList.remove('view-exit');hide.classList.remove('view-enter');
    show.classList.add('view-enter');hide.classList.add('view-exit');
    void show.offsetWidth;
    requestAnimationFrame(()=>show.classList.remove('view-enter'));
    pageTransitionTimer=setTimeout(()=>{hide.hidden=true;hide.classList.remove('view-exit');},240);
  }

  function transitionToolPanel(show,hide){
    clearTimeout(toolTransitionTimer);const token=++toolTransitionToken;
    Object.values(panels).forEach(panel=>{panel.classList.remove('controls-enter','controls-exit');panel.hidden=panel!==show&&panel!==hide;});
    show.hidden=false;show.classList.add('controls-enter');
    if(hide){hide.hidden=false;hide.classList.add('controls-exit');}
    void show.offsetWidth;requestAnimationFrame(()=>show.classList.remove('controls-enter'));
    toolTransitionTimer=setTimeout(()=>{if(token!==toolTransitionToken)return;if(hide){hide.hidden=true;hide.classList.remove('controls-exit');}},240);
  }

  function smoothUpscale(context,width,height){
    if(width<3||height<3)return;const image=context.getImageData(0,0,width,height),data=image.data,source=new Uint8ClampedArray(data),blend=.7,threshold=4;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,up=y?i-width*4:i,down=y<height-1?i+width*4:i,left=x?i-4:i,right=x<width-1?i+4:i;let edge=Math.max(Math.abs(source[i+3]-source[up+3]),Math.abs(source[i+3]-source[down+3]),Math.abs(source[i+3]-source[left+3]),Math.abs(source[i+3]-source[right+3]));for(let c=0;c<3;c++)edge=Math.max(edge,Math.abs(source[i+c]-source[up+c]),Math.abs(source[i+c]-source[down+c]),Math.abs(source[i+c]-source[left+c]),Math.abs(source[i+c]-source[right+c]));if(edge<threshold)continue;const neighborAlpha=(source[up+3]+source[down+3]+source[left+3]+source[right+3])/4,alpha=source[i+3]+(neighborAlpha-source[i+3])*blend;for(let c=0;c<3;c++){const weighted=source[up+c]*source[up+3]+source[down+c]*source[down+3]+source[left+c]*source[left+3]+source[right+c]*source[right+3],neighborColor=neighborAlpha?weighted/(neighborAlpha*4):source[i+c];data[i+c]=Math.max(0,Math.min(255,source[i+c]+(neighborColor-source[i+c])*blend));}data[i+3]=Math.max(0,Math.min(255,alpha));}
    context.putImageData(image,0,0);
  }

  function render(){
    if(!sourceImage)return;const token=++generation,w=sourceImage.naturalWidth,h=sourceImage.naturalHeight;
    const imageData=new ImageData(new Uint8ClampedArray(sourcePixels.data),w,h),pixels=imageData.data;
    if(currentTool==='remove'){
      const corners=[[0,0],[Math.max(0,w-4),0],[0,Math.max(0,h-4)],[Math.max(0,w-4),Math.max(0,h-4)]].map(([x,y])=>averageCorner(imageData,x,y,w,h));
      const autoSample=$('#sampleLabel').textContent==='Sampled from the corner';
      if(autoSample){background=[0,1,2].map(c=>Math.round(corners.map(color=>color[c]).sort((a,b)=>a-b).slice(1,3).reduce((sum,value)=>sum+value,0)/2));syncBackgroundControls();}
      const candidates=autoSample?corners:[background];
      const tolerance=Number($('#tolerance').value),outer=tolerance+34,tolerance2=tolerance*tolerance,outer2=outer*outer,size=w*h;
      const colorDistanceSquared=p=>{let best=Infinity;for(const color of candidates){const dr=pixels[p]-color[0],dg=pixels[p+1]-color[1],db=pixels[p+2]-color[2],distance=dr*dr+dg*dg+db*db;if(distance<best)best=distance;}return best;};
      let changed=0;
      if($('#removalMode').value==='connected'){
        const seen=new Uint8Array(size),stack=new Int32Array(size);let top=0;
        const enqueue=index=>{if(seen[index])return;const p=index*4;if(!pixels[p+3]){seen[index]=1;return;}if(colorDistanceSquared(p)<=outer2){seen[index]=1;stack[top++]=index;}};
        for(let x=0;x<w;x++){enqueue(x);enqueue((h-1)*w+x);}for(let y=1;y<h-1;y++){enqueue(y*w);enqueue(y*w+w-1);}
        while(top){const i=stack[--top],p=i*4,alpha=pixels[p+3],distance2=colorDistanceSquared(p);pixels[p+3]=distance2<=tolerance2?0:Math.round(alpha*smoothstep(tolerance,outer,Math.sqrt(distance2)));if(pixels[p+3]<alpha-3)changed++;const x=i%w,y=(i/w)|0;if(x)enqueue(i-1);if(x<w-1)enqueue(i+1);if(y)enqueue(i-w);if(y<h-1)enqueue(i+w);}
      }else{
        // Match background-colored pixels everywhere, including enclosed gaps.
        for(let i=0;i<size;i++){const p=i*4,alpha=pixels[p+3];if(!alpha)continue;const distance2=colorDistanceSquared(p);if(distance2<=outer2){pixels[p+3]=distance2<=tolerance2?0:Math.round(alpha*smoothstep(tolerance,outer,Math.sqrt(distance2)));if(pixels[p+3]<alpha-3)changed++;}}
      }
      backgroundRemovalFound=changed>Math.max(1,size*.001);
    }
    if(token!==generation)return;processedImage=imageData;updateOutput();
  }

  function hexRgb(hex){return[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
  function rgbToHsl(rgb){const r=rgb[0]/255,g=rgb[1]/255,b=rgb[2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2;let h=0,s=0;if(delta){s=delta/(1-Math.abs(2*l-1));if(max===r)h=60*(((g-b)/delta)%6);else if(max===g)h=60*((b-r)/delta+2);else h=60*((r-g)/delta+4);if(h<0)h+=360;}return[h,s,l];}
  function hslToRgb(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let rgb;if(h<60)rgb=[c,x,0];else if(h<120)rgb=[x,c,0];else if(h<180)rgb=[0,c,x];else if(h<240)rgb=[0,x,c];else if(h<300)rgb=[x,0,c];else rgb=[c,0,x];return rgb.map(value=>Math.round((value+m)*255));}
  function outlineDistance(mask,w,h,alphaThreshold){
    // Chamfer distance with extra knight moves gives a much closer approximation
    // to a round, even outline than spreading alpha one pixel at a time.
    const distance=new Uint16Array(mask.length);distance.fill(65535);for(let i=0;i<mask.length;i++)if(mask[i]>=alphaThreshold)distance[i]=0;
    const relax=(at,from,cost)=>{const next=distance[from]+cost;if(next<distance[at])distance[at]=next;};
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x)relax(i,i-1,10);if(y)relax(i,i-w,10);if(x&&y)relax(i,i-w-1,14);if(x+1<w&&y)relax(i,i-w+1,14);if(x>1&&y)relax(i,i-w-2,22);if(x+1<w-1&&y)relax(i,i-w+2,22);if(x&&y>1)relax(i,i-2*w-1,22);if(x+1<w&&y>1)relax(i,i-2*w+1,22);}
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(x+1<w)relax(i,i+1,10);if(y+1<h)relax(i,i+w,10);if(x+1<w&&y+1<h)relax(i,i+w+1,14);if(x&&y+1<h)relax(i,i+w-1,14);if(x+2<w&&y+1<h)relax(i,i+w+2,22);if(x&&x>0&&y+1<h)relax(i,i+w-2,22);if(x+1<w&&y+2<h)relax(i,i+2*w+1,22);if(x&&y+2<h)relax(i,i+2*w-1,22);}
    return distance;
  }
  const smoothstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

  function cropRect(w,h){
    let cw=Math.min(w,Math.max(1,Number($('#cropWidthPx').value)||w)),ch=Math.min(h,Math.max(1,Number($('#cropHeightPx').value)||h));
    const left=Math.min(w-cw,Math.max(0,Number($('#cropLeftPx').value)||0)),top=Math.min(h-ch,Math.max(0,Number($('#cropTopPx').value)||0));
    return{x:left,y:top,w:cw,h:ch};
  }
  function updateResizeDimensions(changed){if(!sourceImage||!$('#resizeWidth').value||!$('#resizeHeight').value)return;let width=Math.max(1,Math.min(16000,Math.round(Number($('#resizeWidth').value)||sourceImage.naturalWidth))),height=Math.max(1,Math.min(16000,Math.round(Number($('#resizeHeight').value)||sourceImage.naturalHeight)));
    if($('#lockResizeRatio').checked){if(changed==='width')height=Math.max(1,Math.min(16000,Math.round(width/resizeRatio)));else if(changed==='height')width=Math.max(1,Math.min(16000,Math.round(height*resizeRatio)));else height=Math.max(1,Math.min(16000,Math.round(width/resizeRatio)));}
    const maxPixels=16000000;if(width*height>maxPixels){const scale=Math.sqrt(maxPixels/(width*height));width=Math.max(1,Math.floor(width*scale));height=Math.max(1,Math.floor(height*scale));}
    $('#resizeWidth').value=width;$('#resizeHeight').value=height;scheduleRender(0);
  }
  function smartCenterCrop(){if(!sourceImage||!sourcePixels)return;const w=sourceImage.naturalWidth,h=sourceImage.naturalHeight,crop=cropRect(w,h),data=sourcePixels.data;let minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>4){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
    if(maxX<0){setCropNumbers({...crop,x:Math.round((w-crop.w)/2),y:Math.round((h-crop.h)/2)});}
    else{const centerX=(minX+maxX+1)/2,centerY=(minY+maxY+1)/2;setCropNumbers({...crop,x:Math.max(0,Math.min(w-crop.w,Math.round(centerX-crop.w/2))),y:Math.max(0,Math.min(h-crop.h,Math.round(centerY-crop.h/2)))});}
    scheduleRender(0);
  }
  function updateCropFrame(){
    if(!sourceImage||currentTool!=='crop')return;const frame=$('#cropFrame'),imageRect=beforeCanvas.getBoundingClientRect(),stackRect=canvasStack.getBoundingClientRect(),crop=cropRect(sourceImage.naturalWidth,sourceImage.naturalHeight),sx=imageRect.width/sourceImage.naturalWidth/previewZoom,sy=imageRect.height/sourceImage.naturalHeight/previewZoom;
    frame.style.left=`${(imageRect.left-stackRect.left)/previewZoom+crop.x*sx}px`;frame.style.top=`${(imageRect.top-stackRect.top)/previewZoom+crop.y*sy}px`;frame.style.width=`${crop.w*sx}px`;frame.style.height=`${crop.h*sy}px`;
    $('#cropWidthInput').value=crop.w;$('#cropHeightInput').value=crop.h;
    $('#cropSizeReadout').textContent=`${crop.w} × ${crop.h} px · Drag the frame to reposition; drag its lower-right corner to resize.`;
  }
  function setCropNumbers(crop){$('#cropWidthPx').value=crop.w;$('#cropHeightPx').value=crop.h;$('#cropLeftPx').value=crop.x;$('#cropTopPx').value=crop.y;$('#cropWidthInput').value=crop.w;$('#cropHeightInput').value=crop.h;}
  function updateTypedCrop(){if(!sourceImage)return;const w=sourceImage.naturalWidth,h=sourceImage.naturalHeight,current=cropRect(w,h),requestedW=$('#cropWidthInput').valueAsNumber,requestedH=$('#cropHeightInput').valueAsNumber;if(!Number.isFinite(requestedW)||!Number.isFinite(requestedH))return;const cw=Math.min(w,Math.max(1,Math.round(requestedW))),ch=Math.min(h,Math.max(1,Math.round(requestedH)));$('#cropWidthInput').value=cw;$('#cropHeightInput').value=ch;$('#cropRatio').value='free';setCropNumbers({w:cw,h:ch,x:Math.min(w-cw,current.x),y:Math.min(h-ch,current.y)});scheduleRender(140);}
  function finishTypedCrop(){if(!sourceImage)return;const current=cropRect(sourceImage.naturalWidth,sourceImage.naturalHeight);if(!Number.isFinite($('#cropWidthInput').valueAsNumber))$('#cropWidthInput').value=current.w;if(!Number.isFinite($('#cropHeightInput').valueAsNumber))$('#cropHeightInput').value=current.h;updateTypedCrop();}
  function updateOutput(){
    if(!processedImage)return;const w=processedImage.width,h=processedImage.height;
    const output=new ImageData(new Uint8ClampedArray(processedImage.data),w,h),pixels=output.data;
    if(currentTool==='recolor'){
      const sensitivity=Number($('#colorSensitivity').value),keepGradients=$('#keepGradients').checked,rules=colorRules.map(rule=>({from:rule.from,to:hexRgb(rule.to),fromHsl:rgbToHsl(rule.from),toHsl:rgbToHsl(hexRgb(rule.to))}));
      for(let i=0;i<pixels.length;i+=4){if(!pixels[i+3])continue;const pixelHsl=keepGradients?rgbToHsl([pixels[i],pixels[i+1],pixels[i+2]]):null;let best=null,distanceLimit=sensitivity;for(const rule of rules){let d;if(keepGradients){const hueDelta=Math.abs(pixelHsl[0]-rule.fromHsl[0]),hueDistance=Math.min(hueDelta,360-hueDelta)*2,saturationDistance=Math.abs(pixelHsl[1]-rule.fromHsl[1])*255;d=Math.hypot(hueDistance,saturationDistance);}else{const dr=pixels[i]-rule.from[0],dg=pixels[i+1]-rule.from[1],db=pixels[i+2]-rule.from[2];d=Math.sqrt(dr*dr+dg*dg+db*db);}if(d<=distanceLimit){distanceLimit=d;best=rule;}}if(best){const rgb=keepGradients?hslToRgb(best.toHsl[0],best.toHsl[1],pixelHsl[2]):best.to;pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];}}
    }
    const border=currentTool==='border',resize=currentTool==='resize',weight=Number($('#borderWidth').value),count=Number($('#outlineCount').value),thicknesses=Array.from($('#outlineColors').querySelectorAll('.outline-thickness input')).map(input=>Number(input.value)||weight);while(thicknesses.length<count)thicknesses.push(weight);const boundaries=[];thicknesses.slice(0,count).forEach((thickness,index)=>boundaries[index]=(boundaries[index-1]||0)+thickness);const padding=border?boundaries.reduce((sum,value)=>sum+value,0):0,outW=border?w+padding*2:resize?Number($('#resizeWidth').value)||w:w,outH=border?h+padding*2:resize?Number($('#resizeHeight').value)||h:h;
    const work=document.createElement('canvas');work.width=outW;work.height=outH;const workCtx=work.getContext('2d',{willReadFrequently:true});
    if(border){
      const total=outW*outH,mask=new Uint8Array(total);let peakAlpha=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const alpha=pixels[(y*w+x)*4+3];mask[(y+padding)*outW+x+padding]=alpha;if(alpha>peakAlpha)peakAlpha=alpha;}
      // Use the opaque core as the contour. Semi-transparent edge pixels then
      // sit over the outline and naturally blend with it instead of separating.
      const distance=outlineDistance(mask,outW,outH,Math.max(1,Math.round(peakAlpha*.92))),colors=Array.from({length:count},(_,i)=>hexRgb($(`#outlineColor${i}`)?.value||'#ffffff')),layer=workCtx.createImageData(outW,outH),lp=layer.data,maxRadius=boundaries[count-1]||0;
      for(let i=0;i<total;i++){const encoded=distance[i];if(!encoded)continue;const radius=encoded/10;if(radius>maxRadius+.5)continue;const p=i*4;let ring=boundaries.findIndex(boundary=>radius<=boundary);if(ring<0)ring=count-1;let color=colors[ring];
        // Blend neighboring outline colors across a narrow band so their joins
        // stay smooth and the requested color remains uniform across each ring.
        for(let edgeIndex=0;edgeIndex<count-1;edgeIndex++){const edge=boundaries[edgeIndex];if(Math.abs(radius-edge)<.2){const t=smoothstep(-.2,.2,radius-edge),inner=colors[edgeIndex],outer=colors[edgeIndex+1];color=inner.map((value,c)=>Math.round(value+(outer[c]-value)*t));break;}}
        lp[p]=color[0];lp[p+1]=color[1];lp[p+2]=color[2];lp[p+3]=Math.round(255*(1-smoothstep(maxRadius-.5,maxRadius+.5,radius)));
      }workCtx.putImageData(layer,0,0);
    }
    if(border||resize){const sourceLayer=document.createElement('canvas');sourceLayer.width=w;sourceLayer.height=h;sourceLayer.getContext('2d').putImageData(output,0,0);if(border)workCtx.drawImage(sourceLayer,padding,padding);else{const enhance=$('#smoothResize').checked;workCtx.imageSmoothingEnabled=enhance;workCtx.imageSmoothingQuality='high';if(enhance&&outW<w&&outH<h){let stage=sourceLayer;while(stage.width/outW>2||stage.height/outH>2){const next=document.createElement('canvas');next.width=Math.max(outW,Math.ceil(stage.width/2));next.height=Math.max(outH,Math.ceil(stage.height/2));const stageCtx=next.getContext('2d');stageCtx.imageSmoothingEnabled=true;stageCtx.imageSmoothingQuality='high';stageCtx.drawImage(stage,0,0,next.width,next.height);stage=next;}workCtx.drawImage(stage,0,0,outW,outH);}else if(enhance&&(outW>w||outH>h)){if(outW>=w&&outH>=h){let stage=sourceLayer;while(outW/stage.width>2||outH/stage.height>2){const next=document.createElement('canvas');next.width=Math.min(outW,stage.width*2);next.height=Math.min(outH,stage.height*2);const stageCtx=next.getContext('2d');stageCtx.imageSmoothingEnabled=true;stageCtx.imageSmoothingQuality='high';stageCtx.drawImage(stage,0,0,next.width,next.height);stage=next;}workCtx.drawImage(stage,0,0,outW,outH);}else workCtx.drawImage(sourceLayer,0,0,outW,outH);smoothUpscale(workCtx,outW,outH);}else workCtx.drawImage(sourceLayer,0,0,outW,outH);}}
    else workCtx.putImageData(output,0,0);
    let sx=0,sy=0,sw=outW,sh=outH;
    if(currentTool==='crop'){const crop=cropRect(w,h);sx=crop.x;sy=crop.y;sw=crop.w;sh=crop.h;}
    const finalData=workCtx.getImageData(sx,sy,sw,sh);canvas.width=sw;canvas.height=sh;ctx.putImageData(finalData,0,0);
    const beforeW=currentTool==='crop'?w:sw,beforeH=currentTool==='crop'?h:sh,nextBeforeKey=`${sourceImage.src}|${currentTool==='crop'?'crop':border?`border-${padding}`:resize?`resize-${sw}x${sh}`:'original'}|${beforeW}x${beforeH}`;
    if(beforeKey!==nextBeforeKey){beforeCanvas.width=beforeW;beforeCanvas.height=beforeH;beforeCtx.clearRect(0,0,beforeW,beforeH);if(currentTool==='crop')beforeCtx.drawImage(sourceImage,0,0,w,h);else if(border)beforeCtx.drawImage(sourceImage,padding,padding,w,h);else beforeCtx.drawImage(sourceImage,0,0,sw,sh);beforeKey=nextBeforeKey;}
    canvasStack.hidden=false;$('#zoomControls').hidden=false;canvasStack.dataset.crop=String(currentTool==='crop');$('#cropFrame').hidden=currentTool!=='crop';$('#emptyState').hidden=true;$('#compareControls').hidden=currentTool==='crop'||currentTool==='convert';$('#pdfPageControls').hidden=!(pdfPages&&currentTool==='convert');updateComparison();if(currentTool==='crop')updateCropFrame();
    $('#previewDimensions').textContent=`${sw} × ${sh} px`;$('#previewStatus').textContent=pdfPages&&currentTool==='convert'?`${pdfPages.length} PDF PAGES READY · EXPORT AS ZIP`:currentTool==='remove'?(backgroundRemovalFound?'BACKGROUND REMOVED':'NO BACKGROUND MATCH · PICK A COLOR OR INCREASE TOLERANCE'):({border:'BORDER ADDED',recolor:colorRules.length?'COLORS CHANGED':'IMAGE READY',crop:'IMAGE CROPPED',resize:'IMAGE RESIZED',convert:'IMAGE READY'})[currentTool];
    $('#downloadButton').disabled=false;$('#copyButton').disabled=false;
  }

  function updateComparison(){const showAfter=comparisonState==='after';canvas.style.clipPath='none';canvas.style.opacity=currentTool==='crop'?'0':showAfter?'1':'0';beforeCanvas.style.opacity=currentTool==='crop'?'1':showAfter?'0':'1';$('#comparisonToggle').dataset.state=comparisonState;document.querySelectorAll('[data-comparison]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.comparison===comparisonState)));}
  function bindNumericRange(range,number,onChange){const min=Number(range.min),max=Number(range.max),commit=(finalize)=>{const raw=number.value.trim();if(raw===''){if(finalize)number.value=range.value;return;}const value=Number(raw);if(!Number.isFinite(value)){if(finalize)number.value=range.value;return;}if((value<min||value>max)&&!finalize)return;const normalized=Math.min(max,Math.max(min,Math.round(value)));range.value=String(normalized);number.value=range.value;onChange();};range.addEventListener('input',()=>{number.value=range.value;onChange();});number.addEventListener('input',()=>commit(false));number.addEventListener('change',()=>commit(true));}
  function refreshOutlineColors(){const count=Number($('#outlineCount').value),container=$('#outlineColors'),old=Array.from(container.querySelectorAll('.outline-row')).map(row=>({color:row.querySelector('.outline-hex')?.value||row.querySelector('input[type="color"]')?.value||'#ffffff',width:Number(row.querySelector('.outline-thickness input[type="range"]')?.value)||Number($('#borderWidth').value)}));$('#outlineCountNumber').value=count;container.replaceChildren();for(let i=0;i<count;i++){const row=document.createElement('div');row.className='outline-row';const heading=document.createElement('div');heading.className='outline-color';const title=document.createElement('span');title.textContent='Outline '+(i+1);const controls=document.createElement('span');controls.className='outline-color-controls';const color=document.createElement('input');color.type='color';color.id='outlineColor'+i;color.value=/^#[\da-f]{6}$/i.test(old[i]?.color)?old[i].color:'#ffffff';color.setAttribute('aria-label','Outline '+(i+1)+' color');color.disabled=!sourceImage;const hex=document.createElement('input');hex.type='text';hex.className='outline-hex';hex.value=color.value;hex.setAttribute('aria-label','Outline '+(i+1)+' hex color');hex.placeholder='#ffffff';hex.maxLength=7;hex.pattern='^#?[0-9a-fA-F]{6}$';hex.disabled=!sourceImage;color.addEventListener('input',()=>{hex.value=color.value;updateOutput();});hex.addEventListener('input',()=>{const value=hex.value.trim(),normalized=value.startsWith('#')?value:'#'+value;if(/^#[\da-f]{6}$/i.test(normalized)){hex.value=normalized;color.value=normalized;updateOutput();}});hex.addEventListener('blur',()=>{if(!/^#[\da-f]{6}$/i.test(hex.value))hex.value=color.value;});controls.append(color,hex);heading.append(title,controls);const thickness=document.createElement('div');thickness.className='outline-thickness';const thicknessTitle=document.createElement('span');thicknessTitle.textContent='Thickness';const width=document.createElement('input');width.type='range';width.className='outline-width';width.min='1';width.max='100';width.value=old[i]?.width||$('#borderWidth').value;width.disabled=!sourceImage;width.setAttribute('aria-label','Outline '+(i+1)+' thickness');const widthNumber=document.createElement('input');widthNumber.type='number';widthNumber.className='range-number outline-width-number';widthNumber.min='1';widthNumber.max='100';widthNumber.step='1';widthNumber.value=width.value;widthNumber.disabled=!sourceImage;widthNumber.setAttribute('aria-label','Outline '+(i+1)+' thickness in pixels');bindNumericRange(width,widthNumber,()=>{updateOutput();});thicknessTitle.append(' ',widthNumber);thickness.append(thicknessTitle,width);row.append(heading,thickness);container.append(row);}}
  function refreshColorRules(){const container=$('#colorRules');container.replaceChildren();if(!colorRules.length){const p=document.createElement('p');p.className='empty-rules';p.textContent='No colors selected yet.';container.append(p);return;}colorRules.forEach((rule,index)=>{const row=document.createElement('div');row.className='color-rule';const original=document.createElement('span');original.className='rule-chip';original.style.backgroundColor=`rgb(${rule.from.join(',')})`;const arrow=document.createElement('span');arrow.className='rule-arrow';arrow.textContent='\u2192';const target=document.createElement('input');target.type='color';target.value=rule.to;target.setAttribute('aria-label',`Replacement color ${index+1}`);const hex=document.createElement('input');hex.type='text';hex.className='outline-hex';hex.value=target.value;hex.maxLength=7;hex.placeholder='#ffffff';hex.pattern='^#?[0-9a-fA-F]{6}$';hex.setAttribute('aria-label',`Replacement color ${index+1} hex`);target.addEventListener('input',()=>{rule.to=target.value;hex.value=rule.to;updateOutput();});hex.addEventListener('input',()=>{const value=hex.value.trim(),normalized=value.startsWith('#')?value:'#'+value;if(/^#[\da-f]{6}$/i.test(normalized)){rule.to=normalized;target.value=normalized;updateOutput();}});hex.addEventListener('blur',()=>{const value=hex.value.trim(),normalized=value.startsWith('#')?value:'#'+value;if(/^#[\da-f]{6}$/i.test(normalized)){hex.value=normalized;rule.to=normalized;target.value=normalized;}else hex.value=target.value;});const remove=document.createElement('button');remove.type='button';remove.className='icon-button';remove.textContent='\u00d7';remove.setAttribute('aria-label',`Remove color ${index+1}`);remove.addEventListener('click',()=>{colorRules.splice(index,1);refreshColorRules();updateOutput();});row.append(original,arrow,target,hex,remove);container.append(row);});}

  function updateCropRatio(){if(!sourceImage)return;const mode=$('#cropRatio').value,w=sourceImage.naturalWidth,h=sourceImage.naturalHeight;$('#cropCustom').hidden=mode!=='custom';if(mode!=='free'){let rw,rh;if(mode==='custom'){rw=Math.max(1,Number($('#cropRatioW').value)||1);rh=Math.max(1,Number($('#cropRatioH').value)||1);}else[rw,rh]=mode.split(':').map(Number);let cw,ch;if(w/h>rw/rh){ch=h;cw=Math.round(h*rw/rh);}else{cw=w;ch=Math.round(w*rh/rw);}setCropNumbers({w:cw,h:ch,x:Math.floor((w-cw)/2),y:Math.floor((h-ch)/2)});}scheduleRender();}
  async function renderPdf(file,allPages=false){
    const version='4.10.38',base=`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/`;
    const pdfjs=await import(`${base}pdf.min.mjs`);pdfjs.GlobalWorkerOptions.workerSrc=`${base}pdf.worker.min.mjs`;
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,pages=[];const count=allPages?pdf.numPages:1;
    for(let n=1;n<=count;n++){const page=await pdf.getPage(n),baseViewport=page.getViewport({scale:1}),scale=Math.min(2,4000/Math.max(baseViewport.width,baseViewport.height)),viewport=page.getViewport({scale}),pdfCanvas=document.createElement('canvas');
      pdfCanvas.width=Math.ceil(viewport.width);pdfCanvas.height=Math.ceil(viewport.height);await page.render({canvasContext:pdfCanvas.getContext('2d'),viewport}).promise;
      const blob=await new Promise(resolve=>pdfCanvas.toBlob(resolve,'image/png'));pages.push({blob,dataUrl:n===1?pdfCanvas.toDataURL('image/png'):'',name:`${file.name.replace(/\.pdf$/i,'')}-page-${String(n).padStart(3,'0')}.png`});}
    return allPages?pages:pages[0].dataUrl;
  }

  function loadPdfPage(index){if(!pdfPages||index<0||index>=pdfPages.length)return;pdfPageIndex=index;const token=++pdfPageRequest;$('#pdfPageSlider').value=index+1;$('#pdfPageValue').textContent=`${index+1} / ${pdfPages.length}`;const url=URL.createObjectURL(pdfPages[index].blob);loadImageUrl(url,pdfFileName,url,token);}
  function loadImageUrl(url,name,blobUrl='',pageRequest=0){
    const image=new Image();image.onload=()=>{
      if(pageRequest&&pageRequest!==pdfPageRequest){if(blobUrl)URL.revokeObjectURL(blobUrl);return;}if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=blobUrl;sourceImage=image;if(!pageRequest)setZoom(1);const pixelCanvas=document.createElement('canvas');pixelCanvas.width=image.naturalWidth;pixelCanvas.height=image.naturalHeight;const pixelCtx=pixelCanvas.getContext('2d',{willReadFrequently:true});pixelCtx.drawImage(image,0,0);sourcePixels=pixelCtx.getImageData(0,0,image.naturalWidth,image.naturalHeight);beforeKey='';sourceName=name.replace(/\.[^.]+$/,'')||'image';colorRules.splice(0);$('#fileInfo').hidden=false;$('#emptyState').hidden=true;canvasStack.hidden=false;
      $('#fileName').textContent=name;$('#fileDimensions').textContent=`${image.naturalWidth} × ${image.naturalHeight} px`;$('#fileThumb').style.backgroundImage=`url("${url}")`;
      $('#canvasHint').textContent=currentTool==='crop'?'Drag the crop frame to reposition it.':'Drag the comparison slider to see before and after.';$('#tolerance').disabled=false;$('#toleranceNumber').disabled=false;$('#sampleButton').disabled=false;$('#backgroundColor').disabled=false;$('#backgroundHex').disabled=false;$('#removalMode').disabled=false;$('#borderWidth').disabled=false;$('#borderWidthNumber').disabled=false;$('#outlineCount').disabled=false;$('#outlineCountNumber').disabled=false;$('#addColorButton').disabled=false;$('#colorSensitivity').disabled=false;$('#colorSensitivityNumber').disabled=false;$('#keepGradients').disabled=false;
      $('#cropRatio').disabled=false;$('#smartCropButton').disabled=false;$('#resizeWidth').disabled=false;$('#resizeHeight').disabled=false;$('#lockResizeRatio').disabled=false;$('#smoothResize').disabled=false;resizeRatio=image.naturalWidth/image.naturalHeight;$('#resizeWidth').value=image.naturalWidth;$('#resizeHeight').value=image.naturalHeight;['#cropWidthPx','#cropHeightPx','#cropLeftPx','#cropTopPx'].forEach(id=>$(id).disabled=false);
      $('#cropRatio').value='free';$('#cropCustom').hidden=true;setCropNumbers({w:Math.max(1,Math.round(image.naturalWidth*.8)),h:Math.max(1,Math.round(image.naturalHeight*.8)),x:Math.round(image.naturalWidth*.1),y:Math.round(image.naturalHeight*.1)});comparisonState='after';
      refreshOutlineColors();refreshColorRules();setBackground([255,255,255],'Sampled from the corner');scheduleRender();
    };
    image.onerror=()=>{if(blobUrl)URL.revokeObjectURL(blobUrl);if(!pageRequest||pageRequest===pdfPageRequest)alert('This image could not be opened. Please try another file.');};image.src=url;
  }
  async function loadFile(file){
    if(!file)return;const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isImage=/^image\/(jpeg|png|webp)$/.test(file.type)||/\.(jpe?g|png|webp)$/i.test(file.name);
    if(!isPdf&&!isImage){alert('Choose a JPG, PNG, WebP, or PDF file.');return;}if(file.size>25*1024*1024){alert('This file is larger than 25 MB. Please choose a smaller file.');return;}
    if(isPdf){$('#previewStatus').textContent='CONVERTING PDF PAGES';try{if(currentTool==='convert'){pdfPages=await renderPdf(file,true);pdfFileName=file.name;pdfPageIndex=0;setZoom(1);$('#pdfPageSlider').min=1;$('#pdfPageSlider').max=pdfPages.length;$('#pdfPageSlider').disabled=false;$('#pdfPageValue').textContent=`1 / ${pdfPages.length}`;$('#pdfPageControls').hidden=false;loadPdfPage(0);for(const option of $('#exportFormat').options)option.disabled=!['image/png','image/jpeg','image/webp'].includes(option.value);$('#exportFormat').value='image/png';}else{pdfPages=null;pdfFileName='';$('#pdfPageControls').hidden=true;loadImageUrl(await renderPdf(file),file.name);}}catch(error){console.error(error);alert('This PDF could not be opened. Check your internet connection and try again.');$('#previewStatus').textContent='READY WHEN YOU ARE';}return;}
    pdfPages=null;pdfFileName='';$('#pdfPageControls').hidden=true;for(const option of $('#exportFormat').options)option.disabled=false;
    const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{if(image.naturalWidth*image.naturalHeight>16000000){URL.revokeObjectURL(url);alert('This image has too many pixels to process smoothly. Please use an image under 16 megapixels.');return;}loadImageUrl(url,file.name,url);};image.onerror=()=>{URL.revokeObjectURL(url);alert('This image could not be opened. Please try another file.');};image.src=url;
  }

  function bytes(text){return new TextEncoder().encode(text);}
  function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
  async function zipFiles(files){
    const encoder=new TextEncoder(),locals=[],central=[];let offset=0;
    for(const file of files){const name=encoder.encode(file.name),body=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(body),local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0x21,true);lv.setUint32(14,crc,true);lv.setUint32(18,body.length,true);lv.setUint32(22,body.length,true);lv.setUint16(26,name.length,true);local.set(name,30);locals.push(local,body);
      const entry=new Uint8Array(46+name.length),cv=new DataView(entry.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,0x21,true);cv.setUint32(16,crc,true);cv.setUint32(20,body.length,true);cv.setUint32(24,body.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);entry.set(name,46);central.push(entry);offset+=local.length+body.length;
    }
    const centralSize=central.reduce((sum,entry)=>sum+entry.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return new Blob([...locals,...central,end],{type:'application/zip'});
  }
  async function convertPageBlob(blob,mime){const bitmap=await createImageBitmap(blob),page=document.createElement('canvas');page.width=bitmap.width;page.height=bitmap.height;const pageCtx=page.getContext('2d');if(mime==='image/jpeg'){pageCtx.fillStyle='#fff';pageCtx.fillRect(0,0,page.width,page.height);}pageCtx.drawImage(bitmap,0,0);bitmap.close();return new Promise(resolve=>page.toBlob(resolve,mime,.94));}
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
    if(pdfPages){const files=[];for(const page of pdfPages){const converted=await convertPageBlob(page.blob,mime);if(!converted||converted.type!==mime){alert('This image format is not supported by your browser. Choose PNG, JPG, or WebP.');return;}files.push({name:page.name.replace(/\.png$/i,`.${ext}`),blob:converted});}blob=await zipFiles(files);const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=`${sourceName}-pages.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    if(mime==='application/pdf')blob=makePdf();
    else if(mime==='image/svg+xml'){const data=canvas.toDataURL('image/png'),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="100%" height="100%" href="${data}"/></svg>`;blob=new Blob([svg],{type:mime});}
    else blob=await new Promise(resolve=>{if(mime==='image/jpeg'){const flat=document.createElement('canvas');flat.width=canvas.width;flat.height=canvas.height;const flatCtx=flat.getContext('2d');flatCtx.fillStyle='#fff';flatCtx.fillRect(0,0,flat.width,flat.height);flatCtx.drawImage(canvas,0,0);flat.toBlob(resolve,mime,.94);}else canvas.toBlob(resolve,mime,.94);});
    if(!blob||((mime==='image/webp'||mime==='image/jpeg')&&blob.type!==mime)){alert('This format is not supported by your browser.');return;}const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=`${sourceName}-optica-studio.${ext}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  input.addEventListener('change',()=>{loadFile(input.files[0]);input.value='';});
  document.addEventListener('paste',event=>{const item=Array.from(event.clipboardData?.items||[]).find(entry=>entry.kind==='file'&&/^image\/(png|jpeg|webp)$/.test(entry.type));if(item){const file=item.getAsFile();if(file){event.preventDefault();loadFile(file);}}});
  dropZone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}});
  for(const name of ['dragenter','dragover'])dropZone.addEventListener(name,event=>{event.preventDefault();dropZone.classList.add('drag-over');});for(const name of ['dragleave','drop'])dropZone.addEventListener(name,event=>{event.preventDefault();dropZone.classList.remove('drag-over');});dropZone.addEventListener('drop',event=>loadFile(event.dataTransfer.files[0]));
  document.querySelectorAll('[data-comparison]').forEach(button=>button.addEventListener('click',()=>{comparisonState=button.dataset.comparison;updateComparison();}));
  window.addEventListener('resize',()=>{if(sourceImage){updateComparison();if(currentTool==='crop')updateCropFrame();}});
  let cropGesture=null,panGesture=null;const cropFrame=$('#cropFrame');
  canvasStack.addEventListener('pointerdown',event=>{if(previewZoom<=1||currentTool==='crop'||picking||event.button!==0)return;event.preventDefault();panGesture={pointerX:event.clientX,pointerY:event.clientY};canvasStack.setPointerCapture(event.pointerId);});
  canvasStack.addEventListener('pointermove',event=>{if(!panGesture)return;panZoom(event.clientX-panGesture.pointerX,event.clientY-panGesture.pointerY);panGesture.pointerX=event.clientX;panGesture.pointerY=event.clientY;});
  canvasStack.addEventListener('pointerup',()=>{panGesture=null;});canvasStack.addEventListener('pointercancel',()=>{panGesture=null;});
  cropFrame.addEventListener('pointerdown',event=>{if(!sourceImage)return;event.preventDefault();const imageRect=beforeCanvas.getBoundingClientRect(),crop=cropRect(sourceImage.naturalWidth,sourceImage.naturalHeight);cropGesture={mode:event.target.closest('.crop-resize')?'resize':'move',pointerX:event.clientX,pointerY:event.clientY,left:crop.x,top:crop.y,width:crop.w,height:crop.h,scaleX:sourceImage.naturalWidth/imageRect.width,scaleY:sourceImage.naturalHeight/imageRect.height};cropFrame.setPointerCapture(event.pointerId);});
  cropFrame.addEventListener('pointermove',event=>{if(!cropGesture)return;const w=sourceImage.naturalWidth,h=sourceImage.naturalHeight,dx=(event.clientX-cropGesture.pointerX)*cropGesture.scaleX,dy=(event.clientY-cropGesture.pointerY)*cropGesture.scaleY;let crop;
    if(cropGesture.mode==='move')crop={w:cropGesture.width,h:cropGesture.height,x:Math.max(0,Math.min(w-cropGesture.width,Math.round(cropGesture.left+dx))),y:Math.max(0,Math.min(h-cropGesture.height,Math.round(cropGesture.top+dy)))};
    else{let cw=Math.max(20,Math.min(w-cropGesture.left,Math.round(cropGesture.width+dx))),ch=Math.max(20,Math.min(h-cropGesture.top,Math.round(cropGesture.height+dy))),mode=$('#cropRatio').value;if(mode!=='free'){let rw,rh;if(mode==='custom'){rw=Math.max(1,Number($('#cropRatioW').value)||1);rh=Math.max(1,Number($('#cropRatioH').value)||1);}else[rw,rh]=mode.split(':').map(Number);if(cw/cropGesture.width>=ch/cropGesture.height)ch=Math.max(20,Math.min(h-cropGesture.top,Math.round(cw*rh/rw)));else cw=Math.max(20,Math.min(w-cropGesture.left,Math.round(ch*rw/rh)));}crop={w:cw,h:ch,x:cropGesture.left,y:cropGesture.top};}
    setCropNumbers(crop);updateCropFrame();
  });
  cropFrame.addEventListener('pointerup',()=>{if(cropGesture){cropGesture=null;scheduleRender(0);}});cropFrame.addEventListener('pointercancel',()=>{if(cropGesture){cropGesture=null;scheduleRender(0);}});
    bindNumericRange($('#tolerance'),$('#toleranceNumber'),()=>scheduleRender());
  $('#removalMode').addEventListener('change',()=>scheduleRender());
  $('#backgroundColor').addEventListener('input',()=>setBackground($('#backgroundColor').value.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)),'Custom color'));
  $('#backgroundHex').addEventListener('input',()=>{const value=$('#backgroundHex').value.trim(),normalized=value.startsWith('#')?value:'#'+value;if(/^#[\da-f]{6}$/i.test(normalized))setBackground(normalized.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)),'Custom color');});
  $('#backgroundHex').addEventListener('blur',()=>{$('#backgroundHex').value=$('#backgroundColor').value;});
  $('#sampleButton').addEventListener('click',()=>{picking=true;$('#pickOverlay').textContent='Click a background color to sample it';$('#pickOverlay').hidden=false;$('#sampleButton').textContent='Cancel';});
  $('#addColorButton').addEventListener('click',()=>{picking=true;$('#pickOverlay').textContent='Click the color you want to replace';$('#pickOverlay').hidden=false;});
  canvasStack.addEventListener('click',event=>{if(!picking)return;const rect=canvas.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;const x=Math.max(0,Math.min(canvas.width-1,Math.floor((event.clientX-rect.left)*canvas.width/rect.width))),y=Math.max(0,Math.min(canvas.height-1,Math.floor((event.clientY-rect.top)*canvas.height/rect.height)));if(currentTool==='recolor'){const p=(y*processedImage.width+x)*4,data=processedImage.data;if(data[p+3]<16)return;colorRules.push({from:[data[p],data[p+1],data[p+2]],to:'#ff6b6b'});refreshColorRules();}else{const data=beforeCtx.getImageData(x,y,1,1).data;setBackground([data[0],data[1],data[2]]);}picking=false;$('#pickOverlay').hidden=true;$('#sampleButton').textContent='Pick color';if(currentTool==='recolor')updateOutput();});
  $('#pickOverlay').addEventListener('click',()=>{picking=false;$('#pickOverlay').hidden=true;$('#sampleButton').textContent='Pick color';});
    bindNumericRange($('#borderWidth'),$('#borderWidthNumber'),()=>{$('#outlineColors').querySelectorAll('.outline-row').forEach(row=>{const width=row.querySelector('.outline-width'),number=row.querySelector('.outline-width-number');width.value=$('#borderWidth').value;number.value=width.value;});updateOutput();});
  bindNumericRange($('#outlineCount'),$('#outlineCountNumber'),()=>{refreshOutlineColors();updateOutput();});
  bindNumericRange($('#colorSensitivity'),$('#colorSensitivityNumber'),updateOutput);
  $('#keepGradients').addEventListener('change',updateOutput);$('#cropRatio').addEventListener('change',updateCropRatio);$('#cropRatioW').addEventListener('input',()=>{if($('#cropRatio').value==='custom')updateCropRatio();});$('#cropRatioH').addEventListener('input',()=>{if($('#cropRatio').value==='custom')updateCropRatio();});
  $('#smartCropButton').addEventListener('click',smartCenterCrop);
  $('#cropWidthInput').addEventListener('input',updateTypedCrop);$('#cropHeightInput').addEventListener('input',updateTypedCrop);$('#cropWidthInput').addEventListener('change',finishTypedCrop);$('#cropHeightInput').addEventListener('change',finishTypedCrop);
  $('#resizeWidth').addEventListener('input',()=>updateResizeDimensions('width'));$('#resizeHeight').addEventListener('input',()=>updateResizeDimensions('height'));$('#lockResizeRatio').addEventListener('change',()=>{if(sourceImage&&$('#lockResizeRatio').checked)resizeRatio=Number($('#resizeWidth').value)/Number($('#resizeHeight').value);});$('#smoothResize').addEventListener('change',updateOutput);
  $('#zoomOut').addEventListener('click',()=>setZoom(previewZoom-.25));$('#zoomIn').addEventListener('click',()=>setZoom(previewZoom+.25));$('#zoomFit').addEventListener('click',()=>setZoom(1));
  $('#pdfPageSlider').addEventListener('input',()=>{$('#pdfPageValue').textContent=`${$('#pdfPageSlider').value} / ${pdfPages?.length||1}`;});$('#pdfPageSlider').addEventListener('change',()=>loadPdfPage(Number($('#pdfPageSlider').value)-1));
  $('#clearButton').addEventListener('click',clearCurrentImage);$('#downloadButton').addEventListener('click',exportImage);
  $('#copyButton').addEventListener('click',async()=>{if(!navigator.clipboard||typeof ClipboardItem==='undefined'){alert('Copying images is unavailable in this browser.');return;}try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);$('#copyButton span').textContent='Copied!';setTimeout(()=>$('#copyButton span').textContent='Copy PNG',1500);}catch{alert('Clipboard access was blocked.');}});
})();
