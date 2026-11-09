export const escapeHtml = value => String(value).replace(/[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export const fmt = value => Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });
