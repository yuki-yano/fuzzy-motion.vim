function! fuzzy_motion#targets(q) abort
  return denops#request('fuzzy-motion', 'targets', [a:q])
endfunction
