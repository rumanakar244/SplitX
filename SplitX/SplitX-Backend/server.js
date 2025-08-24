const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

// ✅ Connect to MongoDB Atlas
mongoose
  .connect(
    "mongodb+srv://splitxUser:splitx123@cluster0.uxvxf5j.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
  )
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((error) => console.error("❌ MongoDB connection error:", error));

// ================= TEST ROUTE =================
app.get("/", (req, res) => {
  res.send("Hello Prakriti, your server is working and MongoDB is connected! 🚀");
});

// ================= USER MODEL =================
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
});
const User = mongoose.model("User", userSchema);

app.post("/add-user", async (req, res) => {
  try {
    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
    });
    await newUser.save();
    res.status(201).json({ message: "✅ User added successfully!", user: newUser });
  } catch (err) {
    res.status(500).json({ error: "❌ Error adding user: " + err.message });
  }
});

// ================= GROUP MODEL =================
const groupSchema = new mongoose.Schema({
  name: String,
  members: [
    {
      name: String,
      isActive: { type: Boolean, default: true },
    },
  ],
});
const Group = mongoose.model("Group", groupSchema);

app.post("/create-group", async (req, res) => {
  try {
    const { name, members } = req.body;
    if (!name) return res.status(400).json({ error: "Group name is required" });

    const group = new Group({
      name,
      members: members?.map((m) => ({ name: m })) || [],
    });

    await group.save();
    res.status(201).json({ message: "✅ Group created successfully!", group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/get-groups", async (req, res) => {
  try {
    const groups = await Group.find();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/join-group", async (req, res) => {
  try {
    const { groupId, memberName } = req.body;
    if (!groupId || !memberName) {
      return res.status(400).json({ error: "groupId and memberName are required" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const existingMember = group.members.find((m) => m.name === memberName);

    if (existingMember) {
      existingMember.isActive = true;
    } else {
      group.members.push({ name: memberName, isActive: true });
    }

    await group.save();
    res.json({ message: "✅ Member joined successfully!", group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/leave-group", async (req, res) => {
  try {
    const { groupId, memberName } = req.body;
    if (!groupId || !memberName) {
      return res.status(400).json({ error: "groupId and memberName are required" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const member = group.members.find((m) => m.name === memberName);
    if (!member) return res.status(404).json({ error: "Member not found in this group" });

    member.isActive = false;
    await group.save();

    res.json({ message: "✅ Member left the group successfully!", group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= EXPENSE MODEL =================
const expenseSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  amount: { type: Number, required: true },
  paidBy: { type: String, required: true },
  description: String,
  date: { type: Date, default: Date.now },
});
const Expense = mongoose.model("Expense", expenseSchema);

app.post("/add-expense", async (req, res) => {
  try {
    const { groupId, amount, paidBy, description } = req.body;

    if (!groupId || !amount || !paidBy) {
      return res.status(400).json({ error: "❌ groupId, amount, and paidBy are required" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "❌ Group not found" });

    const activeMembers = group.members.filter((m) => m.isActive);
    if (activeMembers.length === 0) {
      return res.status(400).json({ error: "❌ No active members in this group" });
    }

    const splitAmount = amount / activeMembers.length;

    const expense = new Expense({ groupId, amount, paidBy, description });
    await expense.save();

    res.status(201).json({
      message: "✅ Expense added successfully!",
      expense,
      splitAmong: activeMembers.map((m) => m.name),
      splitAmount,
    });
  } catch (error) {
    res.status(500).json({ error: "❌ Error adding expense: " + error.message });
  }
});

app.get("/get-expenses/:groupId", async (req, res) => {
  try {
    const expenses = await Expense.find({ groupId: req.params.groupId });
    res.json({ message: "✅ Expenses fetched successfully!", expenses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= TRANSACTION MODEL =================
const transactionSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  payer: { type: String, required: true },
  receiver: { type: String, required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
});
const Transaction = mongoose.model("Transaction", transactionSchema);

// ✅ Record a transaction
app.post("/add-transaction", async (req, res) => {
  try {
    const { groupId, payer, receiver, amount, from, to } = req.body;

    const transaction = new Transaction({
      groupId,
      payer: payer || from,
      receiver: receiver || to,
      amount,
    });
    await transaction.save();

    res.status(201).json({ message: "✅ Transaction recorded!", transaction });
  } catch (error) {
    res.status(500).json({ error: "❌ Error adding transaction: " + error.message });
  }
});

// ✅ Get all transactions of a group
app.get("/get-transactions/:groupId", async (req, res) => {
  try {
    const transactions = await Transaction.find({ groupId: req.params.groupId });
    res.json({ message: "✅ Transactions fetched successfully!", transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= SETTLEMENT API =================
app.get("/settlements/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const expenses = await Expense.find({ groupId });
    const transactions = await Transaction.find({ groupId });

    const balances = {};
    const activeMembers = group.members.filter((m) => m.isActive).map((m) => m.name);
    const totalMembers = activeMembers.length;

    // Step 1: Expenses
    expenses.forEach((exp) => {
      balances[exp.paidBy] = (balances[exp.paidBy] || 0) + exp.amount;
      const share = exp.amount / totalMembers;
      activeMembers.forEach((member) => {
        balances[member] = (balances[member] || 0) - share;
      });
    });

    // Step 2: Transactions
    transactions.forEach((tx) => {
      balances[tx.payer] = (balances[tx.payer] || 0) - tx.amount;
      balances[tx.receiver] = (balances[tx.receiver] || 0) + tx.amount;
    });

    // Step 3: Settlements
    const settlements = [];
    const settlementSteps = [];

    const creditors = Object.entries(balances).filter(([_, bal]) => bal > 0);
    const debtors = Object.entries(balances).filter(([_, bal]) => bal < 0);

    let i = 0, j = 0;
    while (i < creditors.length && j < debtors.length) {
      const [creditor, creditAmt] = creditors[i];
      const [debtor, debtAmt] = debtors[j];

      const settleAmount = Math.min(creditAmt, -debtAmt);

      settlements.push({ from: debtor, to: creditor, amount: settleAmount });
      settlementSteps.push({
        action: Settle ${settleAmount} from ${debtor} to ${creditor}, // ✅ FIXED
        before: { [creditor]: creditors[i][1], [debtor]: debtors[j][1] },
        after: {
          [creditor]: creditors[i][1] - settleAmount,
          [debtor]: debtors[j][1] + settleAmount,
        },
      });

      balances[creditor] -= settleAmount;
      balances[debtor] += settleAmount;
      creditors[i][1] -= settleAmount;
      debtors[j][1] += settleAmount;

      if (creditors[i][1] === 0) i++;
      if (debtors[j][1] === 0) j++;
    }

    res.json({
      message: "✅ Settlement balances calculated!",
      finalBalances: balances,
      settlements,
      settlementSteps,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(🚀 Server running on http://localhost:${PORT});
});