export function dayTotal(data, date) {
    return data.entries.filter(entry => entry.date === date)
        .reduce((total, entry) => total + entry.amount * entry.protein / 100, 0);
}
