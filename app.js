require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { OpenAIApi } = require("openai");
const MongoClient = require("mongodb").MongoClient;
const cron = require("node-cron");

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;
const openai = new OpenAIApi({ key: OPEN_AI_KEY });
const mongoUrl = `mongodb+srv://${DB_USER}:${DB_PASSSWORD}@cluster0.fn2ukws.mongodb.net/?retryWrites=true&w=majority`;

// Connect to MongoDB
MongoClient.connect(
  mongoUrl,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err, client) => {
    if (err) {
      console.error("Error connecting to MongoDB:", err);
      process.exit(1);
    }

    const db = client.db("changelogs");

    // Create the "changelogs" collection (if it doesn't exist)
    db.createCollection("changelogs", (err, collection) => {
      if (err) {
        console.error("Error creating collection:", err);
        process.exit(1);
      }

      console.log("Collection created:", collection.collectionName);

      // Define a function to fetch and summarize changelogs
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

            // Use OpenAI to summarize the changelog data
            const prompt = `Summarize the React changelog:\n${changelogContent}`;
            const response = await openai.createCompletion({
              prompt,
              max_tokens: 100, // Adjust for desired summary length
            });

            if (
              response &&
              response.choices &&
              response.choices[0] &&
              response.choices[0].text
            ) {
              const summarizedChangelog = response.choices[0].text;

              // Check if the changelog is current (e.g., based on a date)
              const currentDate = new Date();
              const isChangelogCurrent = true; // Implement your logic to check if it's current

              if (isChangelogCurrent) {
                // Store the summarized changelog in MongoDB
                db.collection("changelogs").insertOne({
                  summary: summarizedChangelog,
                  timestamp: currentDate,
                });
              }
            }
          }
        } catch (error) {
          console.error("Error fetching or summarizing changelogs:", error);
        }
      };

      // Schedule the cron job to run every 20 minutes
      cron.schedule("*/20 * * * *", () => {
        console.log("Running the cron job...");
        fetchAndSummarizeChangelogs();
      });
    });
  }
);

app.get("/api/retrieve-changelog", (req, res) => {
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
