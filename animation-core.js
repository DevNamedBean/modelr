const FUNCTIONS = Object.freeze({
  abs: Math.abs,
  ceil: Math.ceil,
  cos: Math.cos,
  floor: Math.floor,
  max: Math.max,
  min: Math.min,
  round: Math.round,
  sin: Math.sin,
  sqrt: Math.sqrt
});

export function evaluateDriverExpression(source, input) {
  if (typeof source !== 'string' || source.length > 200) throw new Error('Driver expression must be at most 200 characters.');
  const tokens = source.match(/\s*(?:(\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|([a-zA-Z]+)|(\*\*|[()+\-*/%,^]))/gy);
  if (!tokens) throw new Error('Driver expression contains an unsupported character.');
  const tokenList = [];
  let offset = 0;
  for (const token of tokens) {
    offset += token.length;
    tokenList.push(token.trim());
  }
  if (source.slice(offset).trim()) throw new Error('Driver expression contains an unsupported character.');
  let cursor = 0;
  const peek = () => tokenList[cursor];
  const consume = () => tokenList[cursor++];
  const parsePrimary = () => {
    const token = consume();
    if (token === '(') {
      const value = parseAdditive();
      if (consume() !== ')') throw new Error('Driver expression has unbalanced parentheses.');
      return value;
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token || '')) return Number(token);
    if (/^[a-zA-Z]+$/.test(token || '')) {
      if (token === 'x') return input;
      if (!Object.hasOwn(FUNCTIONS, token)) throw new Error(`Unknown driver variable or function: ${token}.`);
      if (consume() !== '(') throw new Error(`Function ${token} requires parentheses.`);
      const args = [parseAdditive()];
      while (peek() === ',') { consume(); args.push(parseAdditive()); }
      if (consume() !== ')') throw new Error(`Function ${token} has unbalanced parentheses.`);
      if ((token === 'min' || token === 'max') ? args.length < 1 : args.length !== 1) throw new Error(`Function ${token} has the wrong number of arguments.`);
      return FUNCTIONS[token](...args);
    }
    throw new Error('Expected a number, x, function, or parenthesized expression.');
  };
  const parseUnary = () => {
    if (peek() === '+') { consume(); return parseUnary(); }
    if (peek() === '-') { consume(); return -parseUnary(); }
    return parsePrimary();
  };
  const parsePower = () => {
    const left = parseUnary();
    if (peek() === '^' || peek() === '**') { consume(); return left ** parsePower(); }
    return left;
  };
  const parseMultiplicative = () => {
    let value = parsePower();
    while (['*', '/', '%'].includes(peek())) {
      const operator = consume();
      const right = parsePower();
      if ((operator === '/' || operator === '%') && right === 0) throw new Error('Driver expression divides by zero.');
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
    }
    return value;
  };
  const parseAdditive = () => {
    let value = parseMultiplicative();
    while (peek() === '+' || peek() === '-') {
      const operator = consume();
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  if (!tokenList.length) throw new Error('Driver expression cannot be empty.');
  const result = parseAdditive();
  if (cursor !== tokenList.length) throw new Error(`Unexpected token: ${peek()}.`);
  if (!Number.isFinite(result)) throw new Error('Driver expression must produce a finite number.');
  return result;
}

export function interpolateKeyframeAmount(amount, interpolation = 'linear') {
  const t = Math.max(0, Math.min(1, amount));
  if (interpolation === 'constant') return 0;
  if (interpolation === 'ease') return t * t * (3 - 2 * t);
  return t;
}
