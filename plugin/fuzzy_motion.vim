if !exists('g:fuzzy_motion_labels')
  let g:fuzzy_motion_labels = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Z', 'X', 'C', 'V', 'B', 'N', 'M']
endif

if !exists('g:fuzzy_motion_word_regexp_list')
  let g:fuzzy_motion_word_regexp_list = ['[0-9a-zA-Z_-]+', '([0-9a-zA-Z_-]|[.])+', '([0-9a-zA-Z_-]|[().#])+']
endif

function! s:initialize_highlight() abort
  highlight default FuzzyMotionShade   ctermfg=grey ctermbg=NONE cterm=NONE           guibg=NONE    guifg=#777777 gui=NONE
  highlight default FuzzyMotionChar    ctermfg=209  ctermbg=NONE cterm=underline,bold guifg=#E27878 guibg=NONE    gui=underline,bold
  highlight default FuzzyMotionSubChar ctermfg=209  ctermbg=NONE cterm=underline,bold guifg=#FFAF60 guibg=NONE    gui=NONE
endfunction

augroup FuzzyMotion
  autocmd!
  autocmd ColorScheme * call s:initialize_highlight()
augroup END

call s:initialize_highlight()
