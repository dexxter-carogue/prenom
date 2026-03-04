const fetch = require('node-fetch');
async function test() {
    const url = 'https://www.behindthename.com/api/lookup.json?name=jerome&key=jr262550206';
    console.log('Fetching:', url);
    const res = await fetch(url);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', JSON.stringify(data, null, 2));
}
test();
