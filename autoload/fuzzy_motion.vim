function! fuzzy_motion#request(funcname, args) abort
  if denops#plugin#wait('fuzzy-motion') != 0
    return ''
  endif
  return denops#request('fuzzy-motion', a:funcname, a:args)
endfunction

function! fuzzy_motion#targets(q) abort
  return denops#request('fuzzy-motion', 'targets', [a:q])
endfunction
