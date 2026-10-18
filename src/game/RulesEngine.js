export class RulesEngine {
  canPlay(card, topCard, currentColorOverride) {
    const topColor = currentColorOverride || topCard.color;
    if (card.type === 'WILD' || card.type === 'WILD_DRAW4') {
      return true;
    }
    if (topColor !== 'WILD' && card.color === topColor) {
      return true;
    }
    if (topCard.type === 'NUMBER' && card.type === 'NUMBER' && card.value === topCard.value) {
      return true;
    }
    if (card.type !== 'NUMBER' && card.symbol && topCard.symbol && card.symbol === topCard.symbol) {
      return true;
    }
    if (card.type !== 'NUMBER' && topCard.type !== 'NUMBER' && card.type === topCard.type) {
      return true;
    }
    return false;
  }

  canStackResponse(card, pendingTopType) {
    // +4 siempre puede apilar (sobre +2 o sobre +4)
    if (card.type === 'WILD_DRAW4') return true;
    // +2 solo puede apilar sobre +2
    if (card.type === 'DRAW2' && pendingTopType === 'DRAW2') return true;
    return false;
  }
}
