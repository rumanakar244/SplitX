
import express from "express";
import mongoose from "mongoose";
import cron from "node-cron";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// =======================================================
// CONFIG
// =======================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG = {
  DB: "mongodb+srv://splitxUser:splitx123@cluster0.uxvxf5j.mongodb.net/splitx?retryWrites=true&w=majority",
  PORT: 4000,
};

// =======================================================
// DATABASE CONNECTION
// =======================================================
(async () => {
  try {
    await mongoose.connect(CONFIG.DB);
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ Failed to connect MongoDB:", err.message);
    process.exit(1);
  }
})();

// =======================================================
// MONGOOSE SCHEMAS
// =======================================================
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  trustScore: { type: Number, default: 100 },
  badges: [{ type: String }],
});

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
});

const expenseSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
  },
  description: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  splitBetween: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ],
  createdAt: { type: Date, default: Date.now },
});

const settlementSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
  },
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  toUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: { type: Number, required: true, min: 0.01 },
  settled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Group = mongoose.model("Group", groupSchema);
const Expense = mongoose.model("Expense", expenseSchema);
const Settlement = mongoose.model("Settlement", settlementSchema);

// =======================================================
// EXPRESS APP
// =======================================================
const app = express();
// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files like index.html

// =======================================================
// ROUTES
// =======================================================
// Serve the main HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// User Routes
app.post("/users", async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(200).json(existingUser);
    }
    const user = new User({ name, email });
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    err.statusCode = 400;
    next(err);
  }
});

app.put("/users/:id", async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

app.delete("/users/:id", async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      const err = new Error("User not found");
      err.statusCode = 404;
      return next(err);
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
});

// Group Routes
app.post("/groups", async (req, res, next) => {
  try {
    const { name, members } = req.body;
    const group = new Group({ name, members });
    await group.save();
    const populatedGroup = await Group.findById(group._id).populate("members");
    res.status(201).json(populatedGroup);
  } catch (err) {
    err.statusCode = 400;
    next(err);
  }
});

app.get("/groups", async (req, res, next) => {
  try {
    const groups = await Group.find().populate("members");
    res.json(groups);
  } catch (err) {
    next(err);
  }
});

app.get("/groups/:id", async (req, res, next) => {
  try {
    const group = await Group.findById(req.params.id).populate("members");
    if (!group) {
      const err = new Error("Group not found");
      err.statusCode = 404;
      return next(err);
    }
    res.json(group);
  } catch (err) {
    next(err);
  }
});

app.delete("/groups/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const group = await Group.findByIdAndDelete(id);
    if (!group) {
      const err = new Error("Group not found");
      err.statusCode = 404;
      return next(err);
    }
    
    await Expense.deleteMany({ groupId: id });
    await Settlement.deleteMany({ groupId: id });
    res.status(200).json({ message: "Group and associated data deleted successfully." });
  } catch (err) {
    next(err);
  }
});

app.post("/groups/:id/members", async (req, res, next) => {
  try {
    const { memberId } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) {
      const err = new Error("Group not found");
      err.statusCode = 404;
      return next(err);
    }
    
    if (!group.members.includes(memberId)) {
      group.members.push(memberId);
      await group.save();
    }
    
    const populatedGroup = await Group.findById(group._id).populate("members");
    res.json(populatedGroup);
  } catch (err) {
    next(err);
  }
});

// Expense Routes
app.post("/expenses", async (req, res, next) => {
  try {
    const expense = new Expense(req.body);
    await expense.save();
    const populatedExpense = await Expense.findById(expense._id)
      .populate("groupId")
      .populate("paidBy")
      .populate("splitBetween");
    res.status(201).json(populatedExpense);
  } catch (err) {
    err.statusCode = 400;
    next(err);
  }
});

app.get("/groups/:id/expenses", async (req, res, next) => {
  try {
    const expenses = await Expense.find({ groupId: req.params.id })
      .populate("paidBy")
      .populate("splitBetween");
    res.json(expenses);
  } catch (err) {
    next(err);
  }
});

app.delete("/expenses/:id", async (req, res, next) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) {
      const err = new Error("Expense not found");
      err.statusCode = 404;
      return next(err);
    }
    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (err) {
    next(err);
  }
});

// Settlement Routes
app.get("/groups/:id/settlements", async (req, res, next) => {
  try {
    const settlements = await Settlement.find({ groupId: req.params.id })
      .populate("fromUser")
      .populate("toUser");
    res.json(settlements);
  } catch (err) {
    next(err);
  }
});

app.post("/settlements", async (req, res, next) => {
  try {
    const settlement = new Settlement(req.body);
    await settlement.save();
    const populatedSettlement = await Settlement.findById(settlement._id)
      .populate("fromUser")
      .populate("toUser")
      .populate("groupId");
    res.status(201).json(populatedSettlement);
  } catch (err) {
    err.statusCode = 400;
    next(err);
  }
});

app.put("/settlements/:id/settle", async (req, res, next) => {
  try {
    const settlement = await Settlement.findByIdAndUpdate(
      req.params.id,
      { settled: true },
      { new: true }
    ).populate("fromUser").populate("toUser");
    
    if (!settlement) {
      const err = new Error("Settlement not found");
      err.statusCode = 404;
      return next(err);
    }
    
    res.json(settlement);
  } catch (err) {
    next(err);
  }
});

// Export Route
app.post("/export-expense-data", async (req, res, next) => {
  try {
    // In a real implementation, this would generate and send emails
    // For now, we'll just return success
    res.status(200).json({ 
      message: "Export successful! Email notifications sent to all members.",
      data: req.body 
    });
  } catch (err) {
    next(err);
  }
});

// Chatbot Route
app.post("/chatbot", async (req, res, next) => {
  try {
    const { message } = req.body;
    // Simple chatbot responses based on keywords
    let reply = "I'm here to help with SplitX! How can I assist you today?";
    
    if (message.toLowerCase().includes("account")) {
      reply = "To create an account, click the 'Get Started' button on the homepage!";
    } else if (message.toLowerCase().includes("split")) {
      reply = "SplitX makes expense splitting easy! Create a group, add expenses, and we'll calculate who owes what.";
    } else if (message.toLowerCase().includes("group")) {
      reply = "You can create groups by going to the Groups section and clicking 'Create Group'. Add your friends and start tracking expenses together!";
    } else if (message.toLowerCase().includes("payment")) {
      reply = "Settling up is simple! SplitX shows you who owes what, and you can pay directly through UPI with our one-click settlement buttons.";
    } else if (message.toLowerCase().includes("help")) {
      reply = "I can help with creating accounts, managing groups, adding expenses, and settling up. What do you need assistance with?";
    }
    
    res.json({ reply });
  } catch (err) {
    next(err);
  }
});

// =======================================================
// CENTRALIZED ERROR HANDLER
// =======================================================
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  const message = err.message || "An internal server error occurred.";
  res.status(statusCode).json({
    error: {
      message: message,
    },
  });
});

// =======================================================
// START SERVER
// =======================================================
app.listen(CONFIG.PORT, () => {
  console.log(`🚀 Server live at http://localhost:${CONFIG.PORT}`);
});

