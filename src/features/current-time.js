function currentTime(timezone = 'UTC', now = Date.now) {
    const date = new Date(now());
    let local;
    try { local = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long', hour12: false }).format(date); }
    catch { throw new Error('Use a valid IANA timezone, for example Asia/Dhaka or UTC.'); }
    return { utc: date.toISOString(), timezone, local, source: 'Host system clock', note: 'Depends on the host clock being synchronized.' };
}
module.exports = { currentTime };
