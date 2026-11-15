import { Fragment, type ReactNode } from 'react';

const DIGITS: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const PATTERN = /([₀-₉]+|⁻|⁺)/;

/**
 * Zet subscript- en superscripttekens (FiO₂, HCO₃⁻, cmH₂O) om in echte opmaak, zodat ze er in elk lettertype hetzelfde uitzien.
 * Tekst zonder zulke tekens komt ongewijzigd terug; andere inhoud (elementen) blijft zoals ze is.
 */
export function chem(node: ReactNode): ReactNode {
  if (typeof node !== 'string' || !PATTERN.test(node)) return node;
  return node.split(PATTERN).map((part, i) => {
    if (part === '⁻') return <sup key={i}>−</sup>;
    if (part === '⁺') return <sup key={i}>+</sup>;
    if (/^[₀-₉]+$/.test(part)) return <sub key={i}>{[...part].map((c) => DIGITS[c]).join('')}</sub>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
