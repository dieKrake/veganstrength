export function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const today = () => localDate(new Date());

export function dayShift(days, date = new Date()) {
    const shifted = new Date(date);
    shifted.setDate(shifted.getDate() + days);
    return localDate(shifted);
}
