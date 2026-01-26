async function testSearch() {
  const url = 'http://localhost:3002/api/search';
  const payload = {
    bbox: [28.9, 41.0, 29.1, 41.1],
    category: 'kindergarten',
    limit: 10
  };

  console.log('Testing Search API...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Raw Response (first 200 chars):', text.slice(0, 200));

    try {
      const data = JSON.parse(text);
      console.log('JSON Parse Success:', data.success);
    } catch (e) {
      console.log('JSON Parse Failed');
    }
  } catch (err) {
    console.error('Fetch Error:', err.message);
  }
}

testSearch();
