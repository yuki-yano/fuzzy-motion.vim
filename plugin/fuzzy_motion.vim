if !exists('g:fuzzy_motion_labels')
  let g:fuzzy_motion_labels = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Z', 'X', 'C', 'V', 'B', 'N', 'M']
endif

if !exists('g:fuzzy_motion_word_regexp_list')
  let g:fuzzy_motion_word_regexp_list = ['[0-9a-zA-Z_-]+', '([0-9a-zA-Z_-]|[.])+', '([0-9a-zA-Z_-]|[().#])+']
endif
