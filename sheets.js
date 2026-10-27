/* Shared modal chrome. Existing forms and their event handlers keep their DOM nodes. */
function seleccionarSeccionConfiguracion(section){
  var keys=['tarjetas','japon','catalogos'];
  if(keys.indexOf(section)<0)section='tarjetas';
  keys.forEach(function(key){
    var panel=document.getElementById('cfg-section-'+key),tab=document.getElementById('cfg-tab-'+key);
    panel.hidden=key!==section;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
    tab.setAttribute('aria-selected',String(key===section));tab.tabIndex=key===section?0:-1;
  });
}
(function(){
  var stack=[],openers=new WeakMap();
  function close(modal){modal.classList.remove('open');}
  document.querySelectorAll('.mov > .msh').forEach(function(sheet,index){
    var modal=sheet.parentElement,title=sheet.querySelector('.mti');
    if(!title)return;
    sheet.classList.add('aero-sheet');sheet.style.removeProperty('max-height');sheet.style.removeProperty('overflow-y');
    sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.tabIndex=-1;
    if(!title.id)title.id='sheet-title-'+index;
    sheet.setAttribute('aria-labelledby',title.id);
    var header=document.createElement('div');header.className='sheet-header';
    var heading=title.parentElement.classList.contains('movement-heading')?title.parentElement:title;
    header.appendChild(heading);
    var button=document.createElement('button');button.type='button';button.className='sheet-close';
    button.setAttribute('aria-label','Cerrar modal');button.title='Cerrar';
    button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    button.addEventListener('click',function(){close(modal);});header.appendChild(button);
    var handle=sheet.querySelector('.mhnd');if(handle)handle.remove();
    var content=document.createElement('div');content.className='sheet-content';
    while(sheet.firstChild)content.appendChild(sheet.firstChild);
    sheet.appendChild(header);
    var tabs=content.querySelector('.settings-tabs');if(tabs)sheet.appendChild(tabs);
    sheet.appendChild(content);
    var wasOpen=false;
    new MutationObserver(function(){
      var isOpen=modal.classList.contains('open');if(isOpen===wasOpen)return;wasOpen=isOpen;
      if(isOpen){
        openers.set(modal,document.activeElement);stack.push(modal);modal.style.zIndex=600+stack.length;
        content.scrollTop=0;
      }else{
        stack=stack.filter(function(m){return m!==modal;});
      }
      stack.forEach(function(m,i){m.style.zIndex=601+i;});
      document.querySelectorAll('.mov').forEach(function(m){m.inert=stack.length>0&&m!==stack[stack.length-1];});
      var app=document.getElementById('app');if(app)app.inert=stack.length>0;
      if(isOpen)sheet.focus({preventScroll:true});
      else{
        var opener=openers.get(modal);
        if(opener&&opener.isConnected&&!opener.closest('[inert]'))opener.focus({preventScroll:true});
        else if(stack.length)stack[stack.length-1].querySelector('.sheet-close').focus({preventScroll:true});
      }
    }).observe(modal,{attributes:true,attributeFilter:['class']});
  });
  document.addEventListener('keydown',function(event){
    var modal=stack[stack.length-1];if(!modal)return;
    if(event.key==='Escape'){event.preventDefault();close(modal);return;}
    if(event.key==='Tab'){
      var nodes=Array.from(modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(function(n){return !n.disabled&&n.tabIndex>=0&&n.getClientRects().length;});
      var first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===modal.querySelector('.msh'))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  var tabs=document.querySelector('.settings-tabs');
  if(tabs)tabs.addEventListener('keydown',function(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();var buttons=Array.from(tabs.children),i=buttons.indexOf(document.activeElement);
    i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;
    buttons[i].click();buttons[i].focus();
  });
  seleccionarSeccionConfiguracion('tarjetas');
})();
