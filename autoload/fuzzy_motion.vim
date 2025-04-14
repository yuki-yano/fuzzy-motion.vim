function! fuzzy_motion#request(funcname, args) abort
  if denops#plugin#wait('fuzzy-motion') != 0
    return ''
  endif
  return denops#request('fuzzy-motion', a:funcname, a:args)
endfunction

function! fuzzy_motion#targets(q) abort
  return denops#request('fuzzy-motion', 'targets', [a:q])
endfunction

function! fuzzy_motion#_getchar() abort
  let l:code = getchar()
  if type(l:code) == v:t_string
    let l:code = char2nr(l:code)
  endif
  return l:code
endfunction
