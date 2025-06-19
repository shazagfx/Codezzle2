require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");
const mongoose = require("mongoose");
const cron = require("node-cron");


const { Schema, model } = mongoose;

const postSchema = new Schema({
  userId: String,
  messageId: String,
  channelId: String,
  competitionId: String,
  votes: { type: Number, default: 1 },
});
const Post = model("Post", postSchema);

const stateSchema = new Schema({
  key: String,
  value: String,
  endAt: Number, 
});
const State = model("State", stateSchema);


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});


client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) return;


  let leaderboardChannel = guild.channels.cache.find(
    (c) => c.name === "leaderboard"
  );
  if (!leaderboardChannel) {
    leaderboardChannel = await guild.channels.create({
      name: "leaderboard",
      type: 0,
      reason: "Monthly leaderboard channel",
    });
  }


  setInterval(async () => {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const state = await State.findOne({ key: "currentCompetition" });
    const competitionId = state?.value;
    const ended = state?.endAt && Date.now() > state.endAt;
    if (!competitionId || ended) return;

    const posts = await Post.find({ competitionId })
      .sort({ votes: -1 })
      .limit(10);
    let content = `🏆 **Top 10 Challenge Submissions**\n\n`;

    for (let i = 0; i < posts.length; i++) {
      content += `**${i + 1}.** <@${posts[i].userId}> — 👍 ${
        posts[i].votes
      } votes\n[Message](https://discord.com/channels/${guild.id}/${
        posts[i].channelId
      }/${posts[i].messageId})\n\n`;
    }

    try {
      const messages = await leaderboardChannel.messages.fetch({ limit: 1 });
      const first = messages.first();
      if (first) await first.edit(content);
      else await leaderboardChannel.send(content);
    } catch (err) {
      console.error("❌ Failed to update leaderboard:", err);
    }
  }, 10000);
});


cron.schedule("0 0 23 * *", async () => {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  let challengeChannel = guild.channels.cache.find(
    (c) => c.name === "challenge"
  );
  if (!challengeChannel) {
    challengeChannel = await guild.channels.create({
      name: "challenge",
      type: 0,
      reason: "Monthly challenge start",
    });
  }

  const now = new Date();
  const competitionId = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const endAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days from now

  await State.findOneAndUpdate(
    { key: "currentCompetition" },
    { value: competitionId, endAt },
    { upsert: true, new: true }
  );

  const endDate = new Date(endAt).toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
  });

  challengeChannel.send(`🎉 **Monthly Challenge Started!**
Post your best content here and members can vote using 👍.

⏰ This challenge ends on **${endDate}**
Top 10 submissions will appear live in #leaderboard!`);
});


client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot || !reaction.message.guild) return;
  if (reaction.emoji.name !== "👍") return;

  const state = await State.findOne({ key: "currentCompetition" });
  const competitionId = state?.value;
  const ended = state?.endAt && Date.now() > state.endAt;

  if (!competitionId || ended) return;

  const messageId = reaction.message.id;
  const channelId = reaction.message.channel.id;

  let post = await Post.findOne({ messageId });

  if (post) {
    post.votes += 1;
    await post.save();
  } else {
    await Post.create({
      userId: reaction.message.author.id,
      messageId,
      channelId,
      competitionId,
      votes: 1,
    });
  }
});


mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    client.login(process.env.TOKEN);
  })
  .catch((err) => console.error("❌ MongoDB Error:", err));
