const express = require("express");
const axios = require("axios");
const OpenAiAPI = require("openai");
const MongoClient = require("mongodb").MongoClient;
const cron = require("node-cron");

// Configure the OpenAI API client
const openai = new OpenAiAPI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

const app = express();
const port = process.env.PORT || 3000;
const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017";

let db; // Define db at a higher scope

// Function to establish MongoDB connection
async function connectToMongo() {
  try {
    const client = await MongoClient.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = client.db("changelogs");
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  }
}

const fetchAndSummarizeChangelogs = async () => {
  try {
    // Fetch the changelogs from the React repository on GitHub
    const githubResponse = await axios.get(
      "https://api.github.com/repos/facebook/react/contents/CHANGELOG.md"
    );

    if (githubResponse.status === 200) {
      const changelogContent = Buffer.from(
        githubResponse.data.content,
        "base64"
      ).toString("utf-8");

      // Split the changelog into smaller chunks if it's too large
      const chunkSize = 1000; // Adjust as needed
      const chunks = [];

      for (let i = 0; i < changelogContent.length; i += chunkSize) {
        chunks.push(changelogContent.slice(i, i + chunkSize));
      }

      // Process and summarize each chunk
      for (const chunk of chunks) {
        const prompt = `Summarize the React changelog:\n${chunk}`;
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          prompt: prompt,
          maxTokens: 100,
        });
        if (
          response &&
          response.choices &&
          response.choices[0] &&
          response.choices[0].text
        ) {
          const summarizedChangelog = response.choices[0].text;
          console.log(summarizedChangelog);

          // Check if the changelog is current (e.g., based on a date)
          const currentDate = new Date();
          const isChangelogCurrent = true; // Implement your logic to check if it's current

          if (isChangelogCurrent) {
            // Store the summarized changelog in MongoDB
            await db.collection("changelogs").insertOne({
              summary: summarizedChangelog,
              timestamp: currentDate,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching or summarizing changelogs:", error);
  }
};

connectToMongo().then(() => {
  // Schedule the cron job to run every 20 minutes
  cron.schedule("*/20 * * * *", () => {
    console.log("Running the cron job...");
    fetchAndSummarizeChangelogs();
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Define API route to retrieve the latest changelog
app.get("/api/retrieve-changelog", (req, res) => {
  fetchAndSummarizeChangelogs();
  if (!db) {
    return res
      .status(500)
      .json({ error: "Database connection not established" });
  }

  // Connect to the MongoDB collection where the changelog data is stored
  const changelogCollection = db.collection("changelogs");

  // Query the database for the most recent changelog summary
  changelogCollection
    .find()
    .sort({ timestamp: -1 })
    .limit(1)
    .toArray((err, changelogs) => {
      if (err) {
        console.error("Error querying the database:", err);
        return res.status(500).json({ error: "Internal server error" });
      }

      if (changelogs && changelogs.length > 0) {
        const latestChangelog = changelogs[0].summary;
        return res.status(200).json({ changelog: latestChangelog });
      } else {
        return res.status(404).json({ error: "Changelog not found" });
      }
    });
});
