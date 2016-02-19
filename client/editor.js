'use strict'
var autocompletion=require('./autocompletion'),prefs=require('./prefs'),mode=require('./cm-apl-mode'),
    letter=mode.letter,dfnDepth=mode.dfnDepth,util=require('./util'),cmOnDblClick=util.cmOnDblClick,
    ACB_VALUE=this.ACB_VALUE={pairs:'()[]{}',explode:'{}'}, // value for CodeMirror's "autoCloseBrackets" option when on
    vtips=require('./vtips')
require('./cm-scroll')

var b=function(c,t){return'<a href=# class="'+c+' tb-btn" title="'+t+'"></a>'} // cc:css classes, t:title
var ED_HTML=
  '<div class=toolbar>'+ // CSS classes "first" and "last" indicate button grouping.
    b('tb-ER  tc-only first','Execute line'                            )+
    b('tb-TC  tc-only'      ,'Trace into expression'                   )+
    b('tb-BK  tc-only'      ,'Go back one line'                        )+
    b('tb-FD  tc-only'      ,'Skip current line'                       )+
    b('tb-BH  tc-only'      ,'Stop on next line of calling function'   )+
    b('tb-RM  tc-only'      ,'Continue execution of this thread'       )+
    b('tb-MA  tc-only'      ,'Continue execution of all threads'       )+
    b('tb-ED  tc-only'      ,'Edit name'                               )+
    b('tb-WI  tc-only'      ,'Interrupt'                               )+
    b('tb-CBP tc-only'      ,'Clear trace/stop/monitor for this object')+
    b('tb-LN  tc-only last' ,'Toggle line numbers'                     )+
    b('tb-LN  ed-only first','Toggle line numbers'                     )+
    b('tb-AO  ed-only'      ,'Comment selected text'                   )+
    b('tb-DO  ed-only last' ,'Uncomment selected text'                 )+
    '<span class=tb-sep></span>'+
    '<div class=tb-sc></div>'+
    '<div class="tb-rp ed-only"></div>'+
    b('tb-NX first'         ,'Search for next match'                   )+
    b('tb-PV'               ,'Search for previous match'               )+
    b('tb-case last'        ,'Match case'                              )+
  '</div>'+
  '<div class=ride-win></div>'
b=null

this.Editor=function(ide,e,opts){ // ide:instance of owner IDE, e:DOM element
  var ed=this;ed.ide=ide;ed.$e=$(e).html(ED_HTML);ed.opts=opts;ed.id=opts.id;ed.name=opts.name;ed.emit=opts.emit
  ed.tc=opts.tracer
  ed.xline=null // the line number of the empty line inserted at eof when cursor is there and you press <down>
  ed.oText='';ed.oStop=[] // remember original text and "stops" to avoid pointless saving on EP
  ed.hll=null // highlighted line -- currently executed line in tracer
  ed.lastQuery=ed.lastIC=ed.overlay=ed.annotation=null // search-related state
  ed.focusTimestamp=0
  ed.jumps=[]
  ed.cm=CodeMirror(ed.$e.find('.ride-win')[0],{
    lineNumbers:!!(ed.tc?prefs.lineNumsTracer():prefs.lineNumsEditor()),
    firstLineNumber:0,lineNumberFormatter:function(i){return'['+i+']'},
    smartIndent:prefs.indent()>=0,indentUnit:prefs.indent(),scrollButtonHeight:12,matchBrackets:!!prefs.matchBrackets(),
    autoCloseBrackets:!!prefs.autoCloseBrackets()&&ACB_VALUE,foldGutter:!!prefs.fold(),
    scrollbarStyle:'simple',
    keyMap:'dyalog',extraKeys:{'Shift-Tab':'indentLess',Tab:'tabOrAutocomplete',Down:'downOrXline'}
    // Some options of this.cm can be set from ide.coffee when the corresponding pref changes.
  })
  ed.cm.dyalogCmds=ed
  ed.cm.on('cursorActivity',ed.cursorActivity.bind(ed))
  ed.cm.on('gutterClick',function(cm,l,g){ // g:gutter
    if(g==='breakpoints'||g==='CodeMirror-linenumbers'){cm.setCursor({line:l,ch:0});ed.BP(ed.cm)}
  })
  ed.cm.on('focus',function(){ed.focusTimestamp=+new Date;ide.focusedWin=ed})
  cmOnDblClick(ed.cm,function(e){ed.ED(ed.cm);e.preventDefault();e.stopPropagation()})
  ed.autocomplete=autocompletion.setUp(ed)
  ed.$tb=$('.toolbar',ed.$e)
    .on('click','.tb-hid,.tb-case',function(e){$(e.target).toggleClass('pressed');ed.highlightSearch();return!1})
    .on('mousedown','.tb-btn',function(e){$(e.target).addClass('armed');e.preventDefault()})
    .on('mouseup mouseout','.tb-btn',function(e){$(e.target).removeClass('armed');e.preventDefault()})
    .on('click','.tb-btn',function(e){
      var m,a=$(e.target).prop('class').split(/\s+/)
      for(var i=0;i<a.length;i++)if(m=/^tb-([A-Z]{2,3})$/.exec(a[i])){ed[m[1]](ed.cm);break}
    })
  ed.cmSC=CodeMirror(ed.$tb.find('.tb-sc')[0],{placeholder:'Search',extraKeys:{
    Enter:ed.NX.bind(ed),
    'Shift-Enter':ed.PV.bind(ed),
    'Ctrl-Enter':ed.selectAllSearchResults.bind(ed),
    Tab:function(){(ed.tc?ed.cm:ed.cmRP).focus()},
    'Shift-Tab':ed.cm.focus.bind(ed.cm)
  }})
  ed.cmSC.on('change',function(){ed.highlightSearch()})
  ed.cmRP=CodeMirror(ed.$tb.find('.tb-rp')[0],{placeholder:'Replace',extraKeys:{
    Enter:ed.replace.bind(ed),
    'Shift-Enter':ed.replace.bind(ed,1),
    Tab:ed.cm.focus.bind(ed.cm),
    'Shift-Tab':function(){(ed.tc?ed.cm:ed.cmSC).focus()}
  }})
  var cms=[ed.cmSC,ed.cmRP]
  for(var i=0;i<cms.length;i++){
    cms[i].setOption('keyMap','dyalog')
    cms[i].setOption('scrollbarStyle','null')
    cms[i].addKeyMap({
      Down:ed.NX.bind(ed),
      Up:ed.PV.bind(ed),
      Esc:function(){ed.clearSearch();setTimeout(ed.cm.focus.bind(ed.cm),0)}
    })
  }
  ed.setTracer(!!ed.tc)
  vtips.init(this)
}
this.Editor.prototype={
  updGutters:function(){
    var g=['breakpoints'],cm=this.cm
    cm.getOption('lineNumbers')&&g.push('CodeMirror-linenumbers')
    cm.getOption('foldGutter') &&g.push('CodeMirror-foldgutter')
    cm.setOption('gutters',g)
  },
  createBPEl:function(){
    var e=this.$e[0].ownerDocument.createElement('div');e.className='breakpoint';e.innerHTML='●';return e
  },
  getStops:function(){ // returns an array of line numbers
    var r=[];this.cm.eachLine(function(lh){var m=lh.gutterMarkers;m&&m.breakpoints&&r.push(lh.lineNo())})
    return r.sort(function(x,y){return x-y})
  },
  cursorActivity:function(){
    if(this.xline==null)return
    var ed=this,n=ed.cm.lineCount(),l=ed.cm.getCursor().line
    if(l===ed.xline&&l===n-1&&/^\s*$/.test(ed.cm.getLine(n-1)))return
    if(l<ed.xline&&ed.xline===n-1&&/^\s*$/.test(ed.cm.getLine(n-1))){
      ed.cm.replaceRange('',{line:n-2,ch:ed.cm.getLine(n-2).length},{line:n-1,ch:0},'D')
    }
    ed.xline=null
  },
  scrollCursorIntoProminentView:function(){ // approx. to 1/3 of editor height; might not work near the top or bottom
    var h=this.$e.height(),cc=this.cm.cursorCoords(true,'local'),x=cc.left,y=cc.top
    this.cm.scrollIntoView({left:x,right:x,top:y-h/3,bottom:y+2*h/3})
  },
  clearSearch:function(){
    var ed=this;$('.ride-win .CodeMirror-vscrollbar',ed.$e).prop('title','');$('.tb-sc',ed.$tb).removeClass('no-matches')
    ed.cm.removeOverlay(ed.overlay);ed.annotation&&ed.annotation.clear();ed.overlay=ed.annotation=null
  },
  highlightSearch:function(){
    var ed=this,ic=!$('.tb-case',ed.$tb).hasClass('pressed'),q=ed.cmSC.getValue() // ic:ignore case?, q:query string
    ic&&(q=q.toLowerCase())
    if(ed.lastQuery!==q||ed.lastIC!==ic){
      ed.lastQuery=q;ed.lastIC=ic;ed.clearSearch()
      if(q){
        var s=ed.cm.getValue()
        ic&&(s=s.toLowerCase())
        $('.tb-sc',ed.$tb).toggleClass('no-matches',s.indexOf(q)<0)
        ed.annotation=ed.cm.showMatchesOnScrollbar(q,ic)
        ed.cm.addOverlay(ed.overlay={token:function(stream){
          s=stream.string.slice(stream.pos);ic&&(s=s.toLowerCase())
          var i=s.indexOf(q)
          if(!i){stream.pos+=q.length;return'searching'}else if(i>0){stream.pos+=i}else{stream.skipToEnd()}
        }})
        $('.CodeMirror-vscrollbar',ed.$e).prop('title','Lines on scroll bar show match locations')
      }
    }
    return[q,ic]
  },
  search:function(backwards){
    var cm=this.cm,h=this.highlightSearch(),q=h[0],ic=h[1] // ic:ignore case?, q:query string
    if(q){
      var s=cm.getValue();ic&&(s=s.toLowerCase())
      if(backwards){
        var i=cm.indexFromPos(cm.getCursor('anchor')),j=s.slice(0,i).lastIndexOf(q)
        if(j<0){j=s.slice(i).lastIndexOf(q);if(j>=0)j+=i}
      }else{
        var i=cm.indexFromPos(cm.getCursor()),j=s.slice(i).indexOf(q);j=j>=0?(j+i):s.slice(0,i).indexOf(q)
      }
      if(j>=0){cm.setSelection(cm.posFromIndex(j),cm.posFromIndex(j+q.length));this.scrollCursorIntoProminentView()}
    }
    return!1
  },
  selectAllSearchResults:function(){
    var cm=this.cm,ic=!$('.tb-case',this.$tb).hasClass('pressed') // ic:ignore case?, q:query string
    var q=this.cmSC.getValue();ic&&(q=q.toLowerCase())
    if(q){
      var s=cm.getValue(),sels=[],i=0;ic&&(s=s.toLowerCase())
      while((i=s.indexOf(q,i))>=0){sels.push({anchor:cm.posFromIndex(i),head:cm.posFromIndex(i+q.length)});i++}
      sels.length&&cm.setSelections(sels)
    }
    cm.focus()
  },
  replace:function(backwards){ // replace current occurrence and move to next
    var ic=!$('.tb-case',this.$tb).hasClass('pressed'),   // ignore case?
        q=this.cmSC.getValue()  ;ic&&(q=q.toLowerCase()), // query string
        s=this.cm.getSelection();ic&&(s=s.toLowerCase())  // selection
    s===q&&this.cm.replaceSelection(this.cmRP.getValue(),backwards?'start':'end')
    this.search(backwards)
    var v=this.cm.getValue();ic&&(v=v.toLowerCase())
    $('.tb-sc',this.$tb).toggleClass('no-matches',v.indexOf(q)<0)
  },
  highlight:function(l){ // current line in tracer
    var ed=this;ed.hll!=null&&ed.cm.removeLineClass(ed.hll,'background','highlighted')
    if((ed.hll=l)!=null){
      ed.cm.addLineClass(l,'background','highlighted');ed.cm.setCursor(l,0);ed.scrollCursorIntoProminentView()
    }
  },
  setTracer:function(x){
    var ed=this;ed.tc=x;ed.$e.toggleClass('tracer',x);ed.highlight(null)
    var ln=!!(ed.tc?prefs.lineNumsTracer():prefs.lineNumsEditor())
    ed.cm.setOption('lineNumbers',ln);ed.$tb.find('.tb-LN').toggleClass('pressed',ln)
    ed.updGutters();ed.cm.setOption('readOnly',!!x)
  },
  setReadOnly:function(x){this.cm.setOption('readOnly',x)},
  updSize:function(){var $p=this.$e;this.cm.setSize($p.width(),$p.height()-28)},
  open:function(ee){ // ee:editable entity
    var ed=this,cm=ed.cm;cm.setValue(ed.oText=ee.text.join('\n'));cm.clearHistory()
    if(D.mac){cm.focus();window.focus()}
    // entityType:             16 NestedArray        512 AplClass
    //  1 DefinedFunction      32 QuadORObject      1024 AplInterface
    //  2 SimpleCharArray      64 NativeFile        2048 AplSession
    //  4 SimpleNumericArray  128 SimpleCharVector  4096 ExternalFunction
    //  8 MixedSimpleArray    256 AplNamespace
    if([1,256,512,1024,2048,4096].indexOf(ee.entityType)<0){cm.setOption('mode','text')}
    else{cm.setOption('mode','apl');if(prefs.indentOnOpen()){cm.execCommand('selectAll');cm.execCommand('indentAuto')}}
    cm.setOption('readOnly',ee.readOnly||ee['debugger'])
    var line=ee.currentRow,col=ee.currentColumn||0
    if(line===0&&col===0&&ee.text.indexOf('\n')<0)col=ee.text.length
    cm.setCursor(line,col);cm.scrollIntoView(null,ed.$e.height()/2)
    ed.oStop=(ee.stop||[]).slice(0).sort(function(x,y){return x-y})
    for(var k=0;k<ed.oStop.length;k++)cm.setGutterMarker(ed.oStop[k],'breakpoints',ed.createBPEl())
    D.floating&&$('title',ed.$e[0].ownerDocument).text(ee.name)
  },
  hasFocus:function(){return window.focused&&this.cm.hasFocus()},
  focus:function(){if(!window.focused){window.focus()};this.cm.focus()},
  insert:function(ch){this.cm.getOption('readOnly')||this.cm.replaceSelection(ch)},
  saved:function(err){err?$.alert('Cannot save changes'):this.emit('CloseWindow',{win:this.id})},
  closePopup:function(){if(D.floating){window.onbeforeunload=null;D.forceClose=1;close()}},
  die:function(){this.cm.setOption('readOnly',true)},
  getDocument:function(){return this.$e[0].ownerDocument},
  refresh:function(){this.cm.refresh()},
  cword:function(){ // apl identifier under cursor
    var c=this.cm.getCursor(),s=this.cm.getLine(c.line),r='['+letter+'0-9]*' // r:regex fragment used for identifiers
    return(
        ((RegExp('⎕?'+r+'$').exec(s.slice(0,c.ch))||[])[0]||'')+ // match left  of cursor
        ((RegExp('^'+r     ).exec(s.slice(  c.ch))||[])[0]||'')  // match right of cursor
    ).replace(/^\d+/,'') // trim leading digits
  },
  ED:function(cm){this.emit('Edit',{win:this.id,pos:cm.indexFromPos(cm.getCursor()),text:cm.getValue()})},
  QT:function(){this.emit('CloseWindow',{win:this.id})},
  BK:function(cm){this.tc?this.emit('TraceBackward',{win:this.id}):cm.execCommand('undo')},
  FD:function(cm){this.tc?this.emit('TraceForward' ,{win:this.id}):cm.execCommand('redo')},
  SC:function(cm){
    var v=cm.getSelection();/^[ -\uffff]+$/.test(v)&&this.cmSC.setValue(v)
    this.cmSC.focus();this.cmSC.execCommand('selectAll')
  },
  RP:function(cm){
    var v=cm.getSelection()||this.cword()
    if(v&&v.indexOf('\n')<0){this.cmSC.setValue(v);this.cmRP.setValue(v)}
    this.cmRP.focus();this.cmRP.execCommand('selectAll');this.highlightSearch()
  },
  EP:function(cm){
    var ed=this,v=cm.getValue(),stop=ed.getStops()
    if(ed.tc||v===ed.oText&&''+stop===''+ed.oStop){ed.emit('CloseWindow',{win:ed.id});return} // if tracer or unchanged
    for(var i=0;i<stop.length;i++)cm.setGutterMarker(stop[i],'breakpoints',null)
    ed.emit('SaveChanges',{win:ed.id,text:cm.getValue().split('\n'),stop:stop})
  },
  TL:function(cm){ // toggle localisation
    var name=this.cword(),l,l0=l=cm.getCursor().line;if(!name)return
    while(l>=0&&!/^\s*∇\s*\S/.test(cm.getLine(l)))l-- // search back for tradfn header (might find a dfns's ∇ instead)
    if(l<0&&!/\{\s*$/.test(cm.getLine(0).replace(/⍝.*/,'')))l=0
    if(l<0||l===l0)return
    var m=/([^⍝]*)(.*)/.exec(cm.getLine(l)), s=m[1], com=m[2]
    var a=s.split(';'), head=a[0].replace(/\s+$/,''), tail=a.length>1?a.slice(1):[]
    tail=tail.map(function(x){return x.replace(/\s+/g,'')})
    var i=tail.indexOf(name);i<0?tail.push(name):tail.splice(i,1)
    s=[head].concat(tail.sort()).join(';')+(com?(' '+com):'')
    cm.replaceRange(s,{line:l,ch:0},{line:l,ch:cm.getLine(l).length},'D')
  },
  LN:function(cm){ // toggle line numbers
    var v=!!(this.tc?prefs.lineNumsTracer.toggle():prefs.lineNumsEditor.toggle())
    cm.setOption('lineNumbers',v);this.updGutters();this.$tb.find('.tb-LN').toggleClass('pressed',v)
  },
  PV:function(){this.search(1)},
  NX:function(){this.search()},
  TC:function(){this.emit('StepInto',{win:this.id})},
  AC:function(cm){ // align comments
    var ed=this,ll=cm.lastLine(),o=cm.listSelections() // o:original selections
    var sels=cm.somethingSelected()?o:[{anchor:{line:0,ch:0},head:{line:ll,ch:cm.getLine(ll).length}}]
    var a=sels.map(function(sel){ // a:info about individual selections (Hey, it's AC; we must align our own comments!)
      var p=sel.anchor,q=sel.head;if((p.line-q.line||p.ch-q.ch)>0){var h=p;p=q;q=h} // p:from, q:to
      var l=ed.cm.getRange({line:p.line,ch:0},q,'\n').split('\n')                   // l:lines
      var u=l.map(function(x){return x.replace(/'[^']*'?/g,function(y){return' '.repeat(y.length)})}) // u:scrubbed strings
      var c=u.map(function(x){return x.indexOf('⍝')})                               // c:column index of ⍝
      return{p:p,q:q,l:l,u:u,c:c}
    })
    var m=Math.max.apply(Math,a.map(function(sel){return Math.max.apply(Math,sel.c)}))
    a.forEach(function(sel){
      var r=sel.l.map(function(x,i){var ci=sel.c[i];return ci<0?x:x.slice(0,ci)+' '.repeat(m-ci)+x.slice(ci)})
      r[0]=r[0].slice(sel.p.ch);ed.cm.replaceRange(r.join('\n'),sel.p,sel.q,'D')
    })
    cm.setSelections(o)
  },
  AO:function(cm){ // add comment
    if(cm.somethingSelected()){
      var a=cm.listSelections()
      cm.replaceSelections(cm.getSelections().map(function(s){return s.replace(/^/gm,'⍝').replace(/\n⍝$/,'\n')}))
      for(var i=0;i<a.length;i++){ // correct selection ends for inserted characters:
        var r=a[i],d=r.head.line-r.anchor.line||r.head.ch-r.anchor.ch
        d&&(d>0?r.head:r.anchor).ch++
      }
      cm.setSelections(a)
    }else{
      var l=cm.getCursor().line,p={line:l,ch:0};cm.replaceRange('⍝',p,p,'D');cm.setCursor({line:l,ch:1})
    }
  },
  DO:function(cm){ // delete comment
    if(cm.somethingSelected()){
      var a=cm.listSelections(),u=cm.getSelections()
      cm.replaceSelections(u.map(function(s){return s.replace(/^⍝/gm,'')}))
      for(var i=0;i<a.length;i++){
        var r=a[i],d=r.head.line-r.anchor.line||r.head.ch-r.anchor.ch // d:direction of selection
        if(d&&u[i].split(/^/m).slice(-1)[0][0]==='⍝'){ // if the first character of last line in the selection is ⍝
          (d>0?r.head:r.anchor).ch-- // ... shrink the selection end to compensate for it
        }
      }
      cm.setSelections(a)
    }else{
      var l=cm.getCursor().line,s=cm.getLine(l)
      cm.replaceRange(s.replace(/^( *)⍝/,'$1'),{line:l,ch:0},{line:l,ch:s.length},'D')
      cm.setCursor({line:l,ch:0})
    }
  },
  TGC:function(cm){ // toggle comment
    var b=cm.somethingSelected()?cm.getSelections().join('\n').split('\n').every(function(y){return !y||y[0]==='⍝'})
                                :cm.getLine(cm.getCursor().line)[0]==='⍝'
    this[b?'DO':'AO'](cm)
  },
  ER:function(cm){
    if(this.tc){this.emit('RunCurrentLine',{win:this.id});return}
    if(prefs.autoCloseBlocks()){
      var u=cm.getCursor(),l=u.line,s=cm.getLine(l),m
      var re=/^(\s*):(class|disposable|for|if|interface|namespace|property|repeat|section|select|trap|while|with)\b([^⋄\{]*)$/i
      if(u.ch===s.length&&(m=re.exec(s))&&!dfnDepth(cm.getStateAfter(l-1))){
        var pre=m[1],kw=m[2],post=m[3],l1=l+1,end=cm.lastLine();kw=kw[0].toUpperCase()+kw.slice(1).toLowerCase()
        while(l1<=end&&/^\s*(?:$|⍝)/.test(cm.getLine(l1)))l1++ // find the next non-blank line
        var s1=cm.getLine(l1)||'',pre1=s1.replace(/\S.*$/,'')
        if(pre.length>pre1.length||pre.length===pre1.length&&!/^\s*:(?:end|else|andif|orif|case|until|access)/i.test(s1)){
          var r=':'+kw+post+'\n'+pre+':End'
          prefs.autoCloseBlocksEnd()||(r+=kw)
          cm.replaceRange(r,{line:l,ch:pre.length},{line:l,ch:s.length})
          cm.execCommand('indentAuto');cm.execCommand('goLineUp');cm.execCommand('goLineEnd')
        }
      }
    }
    cm.execCommand('newlineAndIndent')
  },
  BH:function(){this.emit('ContinueTrace' ,{win:this.id})},
  RM:function(){this.emit('Continue'      ,{win:this.id})},
  MA:function(){this.emit('RestartThreads',{win:this.id})},
  CBP:function(){ // Clear trace/stop/monitor for this object
    var ed=this,n=ed.cm.lineCount();for(var i=0;i<n;i++)ed.cm.setGutterMarker(i,'breakpoints',null)
    ed.tc&&ed.emit('SetLineAttributes',{win:ed.id,nLines:n,stop:ed.getStops(),trace:[],monitor:[]})
  },
  BP:function(cm){ // toggle breakpoint
    var sels=cm.listSelections()
    for(var i=0;i<sels.length;i++){
      var p=sels[i].anchor,q=sels[i].head;if(p.line>q.line){var h=p;p=q;q=h}
      var l1=q.line-(p.line<q.line&&!q.ch)
      for(var l=p.line;l<=l1;l++)cm.setGutterMarker(l,'breakpoints',
        (cm.getLineHandle(l).gutterMarkers||{}).breakpoints?null:this.createBPEl()
      )
    }
    this.tc&&this.emit('SetLineAttributes',{win:this.id,nLines:cm.lineCount(),stop:this.getStops()})
  },
  RD:function(cm){
    if(cm.somethingSelected()){cm.execCommand('indentAuto')}
    else{var u=cm.getCursor();cm.execCommand('SA');cm.execCommand('indentAuto');cm.setCursor(u)}
  },
  VAL:function(cm){
    var a=cm.getSelections(), s=a.length!==1?'':!a[0]?this.cword():a[0].indexOf('\n')<0?a[0]:''
    s&&this.ide.wins[0].opts.exec(['      '+s],0)
  },
  addJump:function(cm){var j=this.jumps,u=cm.getCursor();j.push({lh:cm.getLineHandle(u.line),ch:u.ch})>10&&j.shift()},
  JBK:function(cm){var p=this.jumps.pop();p&&cm.setCursor({line:p.lh.lineNo(),ch:p.ch})},
  tabOrAutocomplete:function(cm){
    if(cm.somethingSelected()){cm.execCommand('indentMore');return}
    var c=cm.getCursor(),s=cm.getLine(c.line);if(/^ *$/.test(s.slice(0,c.ch))){cm.execCommand('indentMore');return}
    this.autocompleteWithTab=1;this.emit('GetAutocomplete',{line:s,pos:c.ch,token:this.id,win:this.id})
  },
  downOrXline:function(cm){
    var l=cm.getCursor().line;if(l!==cm.lastLine()||/^\s*$/.test(cm.getLine(l))){cm.execCommand('goLineDown');return}
    cm.execCommand('goDocEnd');cm.execCommand('newlineAndIndent');this.xline=l+1
  },
  onbeforeunload:function(){ // called when the user presses [X] on the OS window
    var ed=this
    if(ed.ide.dead){var f=D.forceCloseNWWindow;f&&f()}
    else if(ed.tc||ed.cm.getValue()===ed.oText&&''+ed.getStops()===''+ed.oStop){ed.EP(ed.cm)}
    else if(!ed.dialog){
      window.focus()
      ed.dialog=$('<p>The object "'+ed.name+'" has changed.<br>Do you want to save the changes?').dialog({
        width:400,
        close:function(){ed.dialog.dialog('close');ed.dialog=null},
        buttons:[
          {html:'<u>Y</u>es'   ,click:function(){ed.dialog.dialog('close');ed.dialog=null;ed.EP(ed.cm)}},
          {html:'<u>N</u>o'    ,click:function(){ed.dialog.dialog('close');ed.dialog=null;ed.QT(ed.cm)}},
          {html:'<u>C</u>ancel',click:function(){ed.dialog.dialog('close');ed.dialog=null}}
        ]
      })
      // When a string is returned from onbeforeunload:
      //   NW.js prevents the window from closing.
      //   Browsers ask the user "Are you sure you want to close this window?"
      //   In addition, some browsers display the returned string along with the above question.
      return''
    }
  }
}
