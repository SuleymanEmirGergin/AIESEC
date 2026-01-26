async function testSearch() {
  const url = 'http://localhost:3003/api/search';
  const payload = {
    bbox: [28.9, 41.0, 29.1, 41.1],
    category: 'kindergarten',
    limit: 10
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    console.log('Status 3003:', response.status);
    const data = await response.json();
    console.log('Success 3003:', data.success);
    if (data.success) console.log('Found 3003:', data.total);
  } catch (err) {
    console.log('Error 3003:', err.message);
  }
}
testSearch();
