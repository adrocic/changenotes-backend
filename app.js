// app.js
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

// Define a simple route
app.get("/api/data", (req, res) => {
  const sampleData = {
    message: "Hello, this is your sample data!",
  };

  res.json(sampleData);
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
