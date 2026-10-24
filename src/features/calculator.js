// A bounded arithmetic parser, never eval/Function or a shell.
function calculate(expression) {
    if (expression.length > 200 || /[^\d\s.+\-*/%^()]/.test(expression)) throw new Error('Use numbers and + - * / % ^ parentheses only.');
    const tokens = expression.match(/\d*\.\d+|\d+\.?\d*|\*\*|[()+\-*/%^]/g) || [];
    let at = 0; let operations = 0;
    const bounded = value => {
        if (++operations > 100 || !Number.isFinite(value) || Math.abs(value) > 1e100) throw new Error('Calculation exceeds safe limits.');
        return value;
    };
    function atom(depth = 0) {
        if (depth > 20) throw new Error('Expression is too deeply nested.');
        if (tokens[at] === '(') { at++; const value = sum(depth + 1); if (tokens[at++] !== ')') throw new Error('Unbalanced parentheses.'); return value; }
        const token = tokens[at++];
        if (!/^(?:\d*\.\d+|\d+\.?\d*)$/.test(token || '')) throw new Error('Invalid arithmetic expression.');
        return bounded(Number(token));
    }
    function power(depth) {
        const base = atom(depth);
        if (['^', '**'].includes(tokens[at])) { at++; const exponent = unary((depth || 0) + 1); if (Math.abs(exponent) > 12) throw new Error('Exponent is too large.'); return bounded(base ** exponent); }
        return base;
    }
    function unary(depth) {
        if (depth > 20) throw new Error('Expression is too deeply nested.');
        if (tokens[at] === '+') { at++; return unary(depth + 1); }
        if (tokens[at] === '-') { at++; return -unary(depth + 1); }
        return power(depth);
    }
    function product(depth) {
        let value = unary(depth);
        while (['*','/','%'].includes(tokens[at])) { const op = tokens[at++]; const rhs = unary(depth); value = bounded(op === '*' ? value * rhs : op === '/' ? value / rhs : value % rhs); }
        return value;
    }
    function sum(depth) {
        let value = product(depth);
        while (['+','-'].includes(tokens[at])) { const op = tokens[at++]; const rhs = product(depth); value = bounded(op === '+' ? value + rhs : value - rhs); }
        return value;
    }
    const value = sum(0);
    if (at !== tokens.length) throw new Error('Invalid arithmetic expression.');
    return { expression, result: Number(value.toPrecision(12)) };
}
module.exports = { calculate };
