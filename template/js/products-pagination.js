/* Pheladelfia catalog. Uses Zoho's bundled sort_by_products.getProducts and
   zs-event-get-products-list-* events, as in the official FACE base theme.
   All facets are sent to Zoho; no filtering of the current page in the browser. */
(function () {
  'use strict';
  function start() {
    var target = document.querySelector('[data-sort-by-products-target]');
    if (!target) return;
    var panel = document.querySelector('[data-zs-filter-container]');
    var sort = document.querySelector('[data-sort-by-products]');
    var selected = document.querySelector('[data-zs-selected-filters-conatainer]');
    var feedback = document.querySelector('[data-ph-catalog-feedback]');
    var retry = document.querySelector('[data-ph-catalog-retry]');
    var values = new Map(), busy = false, queued = null, timer, firstFacets = true;
    function all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
    function attr(el, name) { return el.getAttribute('data-zs-filter-option-' + name) || ''; }
    function say(message) { if (feedback) { feedback.hidden = !message; feedback.textContent = message; } }
    function inputs() { return panel ? all('[data-zs-filter-option-value]', panel) : []; }
    function capture(input) {
      return { id: attr(input,'value-id'), type: attr(input,'value-type'), value: attr(input,'value-data'), group: attr(input,'group-id'), label: attr(input,'value-formatted') || input.closest('label')?.textContent.trim() || '' };
    }
    function restore() {
      var url = new URL(location.href), saved = url.searchParams.getAll('pf');
      values.clear();
      inputs().forEach(function (input) {
        input.checked = saved.indexOf(attr(input,'value-id')) >= 0;
        if (input.checked) values.set(attr(input,'value-id'),capture(input));
      });
      saved.forEach(function (id) {
        if (!/^custom_price_\d+(?:\.\d+)?_\d+(?:\.\d+)?$/.test(id)) return;
        var parts = id.split('_');
        values.set(id,{id:id,type:'2',value:parts.slice(2).join('_'),group:'',label:parts.slice(2).join(' – ')});
      });
      if (sort && url.searchParams.has('sort_by')) {
        var found = Array.from(sort.options).some(function (o) { return o.value === url.searchParams.get('sort_by'); });
        if (found) sort.value = url.searchParams.get('sort_by');
      }
      renderSelected();
    }
    function renderSelected() {
      if (!selected) return;
      selected.replaceChildren();
      if (values.size) {
        var clear = document.createElement('button'); clear.type='button'; clear.className='ph-filter-clear'; clear.textContent='Clear all';
        clear.addEventListener('click',function(){ values.clear(); sync(); request(false,true); }); selected.appendChild(clear);
      }
      values.forEach(function (value) {
        var chip=document.createElement('span'); chip.className='ph-filter-chip';
        var label=document.createElement('span'); label.textContent=value.label || value.value; chip.appendChild(label);
        var button=document.createElement('button');button.type='button';button.textContent='×';button.setAttribute('aria-label','Remove filter');
        button.addEventListener('click',function(){ values.delete(value.id); sync(); request(false,true); });chip.appendChild(button);selected.appendChild(chip);
      });
      selected.style.display=values.size?'flex':'none';
    }
    function sync() { inputs().forEach(function (input) { input.checked=values.has(attr(input,'value-id')); }); renderSelected(); }
    function queryParams(append) {
      var params={is_filters:true,send_facet:true};
      if(sort && sort.value) params.sort_by=sort.value;
      var grouped={};
      values.forEach(function (v) {
        if(v.type==='2') {
          var range=v.value.split('_');
          if(Number(range[1])===0) params.price_greater_equals=range[0];
          else {params.price_start=range[0];params.price_end=range[1];}
          return;
        }
        var key={'4':'attribute_color_ids','8':'brand_ids','9':'tag_ids'}[v.type];
        if(v.type==='5' || v.type==='6') {
          var kind={'5':'attribute','6':'specification'}[v.type];
          if(!v.group) return;
          var groups=kind+'_ids'; grouped[groups]=grouped[groups]||[];
          if(grouped[groups].indexOf(v.group)<0) grouped[groups].push(v.group);
          key=kind+'_'+v.group+(v.type==='5'?'_option_ids':'_value_ids');
        }
        if(key) {grouped[key]=grouped[key]||[];grouped[key].push(v.value);}
      });
      Object.keys(grouped).forEach(function(key){params[key]=grouped[key].join(',');});
      var term=new URL(location.href).searchParams.get('search_term_in_category');
      if(term) params.search_term_in_category=term;
      if(append) {var more=target.querySelector('[data-has-more-products]');params.page_number=Number(more?.getAttribute('data-current-page-number')||1)+1;}
      return params;
    }
    function saveUrl() {
      var url=new URL(location.href);url.searchParams.delete('pf');url.searchParams.delete('page_number');
      values.forEach(function(v){url.searchParams.append('pf',v.id);});
      if(sort?.value) url.searchParams.set('sort_by',sort.value);
      history.pushState(null,'',url.pathname+url.search+url.hash);
    }
    function unlock() {clearTimeout(timer);busy=false;target.setAttribute('aria-busy','false');target.classList.remove('theme-blur-loading');}
    function fail() {unlock();queued=null;say('Could not load products. Please try again.');if(retry)retry.hidden=false;}
    function request(append,write) {
      if(write)saveUrl();
      if(busy){queued={append:false};return;}
      if(!window.sort_by_products || typeof window.sort_by_products.getProducts!=='function'){fail();return;}
      busy=true;if(retry)retry.hidden=true;say('Loading plants…');target.setAttribute('aria-busy','true');target.classList.add('theme-blur-loading');
      timer=setTimeout(function(){fail();},20000);
      try {window.sort_by_products.getProducts(queryParams(append),append?'append':'innerHTML');} catch(error) {fail();}
    }
    function count() {
      var node=document.querySelector('[data-ph-catalog-count]');
      if(node)node.textContent=target.querySelectorAll('[data-ph-product-card]').length+' products shown';
    }
    document.addEventListener('zs-event-get-products-list-success',function(event){
      if(!busy)return;
      var data=event.detail||{};unlock();
      if(queued){queued=null;request(false,false);return;}
      if(typeof data.content!=='string'){fail();return;}
      if(data.insert_type==='append') {
        target.querySelectorAll('[data-has-more-products],[data-lazy-load-products]').forEach(function(el){el.remove();});
        target.insertAdjacentHTML('beforeend',data.content);
      }else target.innerHTML=data.content;
      if(panel && typeof data.filters_content==='string')panel.innerHTML=data.filters_content;
      if (firstFacets) { firstFacets=false; var before=values.size; restore(); if(values.size>before){request(false,false);return;} }
      document.querySelectorAll('[data-ph-initial-empty]').forEach(function(el){el.hidden=true;});
      var hasFacets = !!panel?.querySelector('[data-zs-filter-option-value],.ph-filter-category');
      var catalog=target.closest('.ph-catalog');
      catalog?.classList.toggle('has-no-filters',!hasFacets);
      if(panel)panel.hidden=!hasFacets;
      var filterToggle=document.querySelector('[data-ph-filter-toggle]');
      if(filterToggle)filterToggle.hidden=!hasFacets;
      sync();count();say('');
      if(!target.querySelector('[data-ph-product-card]'))say('No products match your filters.');
      document.dispatchEvent(new CustomEvent('ph-catalog-updated',{detail:{root:target}}));
    });
    document.addEventListener('zs-event-get-products-list-failure',fail);
    panel?.addEventListener('change',function(event){
      var input=event.target.closest('[data-zs-filter-option-value]');if(!input)return;
      var value=capture(input);
      if(input.type==='radio')values.forEach(function(v,id){if(v.type===value.type)values.delete(id);});
      if(input.checked)values.set(value.id,value);else values.delete(value.id);
      sync();request(false,true);
    });
    panel?.addEventListener('click',function(event){
      var clear=event.target.closest('[data-zs-filter-option-clear]');
      if(clear){var group=clear.closest('[data-zs-filter-option-container]');all('[data-zs-filter-option-value]',group).forEach(function(i){values.delete(attr(i,'value-id'));});sync();request(false,true);}
      var apply=event.target.closest('[data-zs-filter-option-price-custom-btn]');if(!apply)return;
      var box=apply.closest('[data-zs-filter-option-container]');
      var low=box.querySelector('[data-zs-filter-option-price-custom-min-box]'),high=box.querySelector('[data-zs-filter-option-price-custom-max-box]');
      var error=box.querySelector('[data-zs-filter-option-price-custom-error-container]'),a=Number(low.value),b=Number(high.value);
      var message=(!low.value&&!high.value)?'Enter a price range.':(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)?'Enter a valid price.':(high.value&&b<a)?'Maximum price must be greater than minimum price.':'';
      error.hidden=!message;error.textContent=message;if(message)return;
      values.forEach(function(v,id){if(v.type==='2')values.delete(id);});
      var id='custom_price_'+a+'_'+b;values.set(id,{id:id,type:'2',value:a+'_'+b,group:'',label:a+' – '+(b||'+')});sync();request(false,true);
    });
    sort?.addEventListener('change',function(){request(false,true);});
    target.addEventListener('click',function(event){if(event.target.closest('[data-has-more-products]')&&!busy)request(true,false);});
    retry?.addEventListener('click',function(){location.reload();});
    window.addEventListener('popstate',function(){restore();request(false,false);});
    restore();count();
    // Refresh facets even when the initial page has only one product or none.
    request(false,false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
