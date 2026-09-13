/**
 * Typography rules that are shared because they encode a layout contract, not
 * a visual choice.
 *
 * Dashboard tiles (macro rings, the Daily Summary card) size their content from
 * a fixed-width grid, so an unbounded OS font scale would push a word like
 * "Protein" past its column and Android would then break it mid-word
 * ("Protei" / "n") or ellipsize it ("Protei…"). Neither is acceptable for a
 * three-to-seven character macro label, so tiles cap the scale at a value the
 * grid is proven to fit (see the layout math in MacroCard/MacroRing) while the
 * label still grows well past the default size for legibility.
 *
 * Everything that is *not* width-constrained (paragraphs, list rows, sheets)
 * must keep unbounded scaling — do not apply this cap there.
 */
export const TILE_MAX_FONT_SCALE = 1.5;
