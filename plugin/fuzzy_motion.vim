if !exists('g:fuzzy_motion_labels')
  let g:fuzzy_motion_labels = [
  \ 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L',
  \ 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P',
  \ 'Z', 'X', 'C', 'V', 'B', 'N', 'M'
  \ ]
endif

if !exists('g:fuzzy_motion_word_regexp_list')
  let g:fuzzy_motion_word_regexp_list = ['[0-9a-zA-Z_-]+', '([0-9a-zA-Z_-]|[.])+', '([0-9a-zA-Z_-]|[().#])+', '\P{Script_Extensions=Latin}+']
endif

if !exists('g:fuzzy_motion_word_filter_regexp_list')
  let g:fuzzy_motion_word_filter_regexp_list = []
endif

if !exists('g:fuzzy_motion_auto_jump')
  let g:fuzzy_motion_auto_jump = v:false
endif

if !exists('g:fuzzy_motion_disable_match_highlight')
  let g:fuzzy_motion_disable_match_highlight = v:false
endif

if !exists('g:fuzzy_motion_matchers')
  let g:fuzzy_motion_matchers = ['fzf']
endif

function! s:initialize_highlight() abort
  highlight default FuzzyMotionShade   ctermfg=grey ctermbg=NONE cterm=NONE           guifg=#777777 guibg=NONE gui=NONE
  highlight default FuzzyMotionChar    ctermfg=209  ctermbg=NONE cterm=underline,bold guifg=#E27878 guibg=NONE gui=underline,bold
  highlight default FuzzyMotionSubChar ctermfg=209  ctermbg=NONE cterm=underline,bold guifg=#FFAF60 guibg=NONE gui=NONE
  highlight default FuzzyMotionMatch   ctermfg=grey ctermbg=NONE cterm=underline,bold guifg=#7daea3 guibg=NONE gui=NONE
endfunction

augroup FuzzyMotion
  autocmd!
  autocmd ColorScheme * call s:initialize_highlight()
augroup END

call s:initialize_highlight()

command! -nargs=? FuzzyMotion call fuzzy_motion#request("execute", [])
