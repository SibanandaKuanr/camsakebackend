import User from "../models/User.js";

// Send friend request
export const sendFriendRequest = async (req, res) => {
  try {
    const senderId = req.user._id;
    const receiverId = req.params.id;

    if (senderId.toString() === receiverId) {
      return res.status(400).json({ message: "You cannot add yourself" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "User not found" });
    }

    const alreadyExists = receiver.friends.some(
      (f) => f.user.toString() === senderId.toString()
    );
    if (alreadyExists) {
      return res.status(400).json({ message: "Request already exists" });
    }

    // sender side (outgoing request)
    await User.updateOne(
      { _id: senderId },
      {
        $push: {
          friends: {
            user: receiverId,
            status: "pending",
            requestedBy: senderId,
          },
        },
      }
    );

    // receiver side (incoming request)
    await User.updateOne(
      { _id: receiverId },
      {
        $push: {
          friends: {
            user: senderId,
            status: "pending",
            requestedBy: senderId,
          },
        },
      }
    );

    res.json({ message: "Friend request sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Accept friend request
export const acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const friendId = req.params.id;

    await User.updateOne(
      { _id: userId, "friends.user": friendId },
      { $set: { "friends.$.status": "accepted" } }
    );

    await User.updateOne(
      { _id: friendId, "friends.user": userId },
      { $set: { "friends.$.status": "accepted" } }
    );

    res.json({ message: "Friend request accepted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get friends list
export const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("friends.user", "firstName lastName email role profilePicture")
      .lean();

    // show received requests including old entries without direction
    const receivedRequests = (user.friends || []).filter(
      (f) =>
        (f.direction === "received" || !f.direction) &&
        f.status === "pending"
    );

    res.json({ friends: receivedRequests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
//see friendrequest
// controllers/friendcontroller.js
export const getAcceptedFriends = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .populate({
        path: "friends.user",
        select: "firstName lastName email gender role profilePicture",
      });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Filter only accepted friends
    const acceptedFriends = user.friends.filter(
      (f) => f.status === "accepted"
    );

    res.json({
      friends: acceptedFriends,
      count: acceptedFriends.length,
    });
  } catch (error) {
    console.error("Get accepted friends error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getFriendlists = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("friends.user", "firstName lastName email role profilePicture")
      .lean();

    res.json({ friends: user.friends || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get opposite-gender users for friend suggestions
export const getOppositeUsers = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id).lean();
    const oppositeRole = currentUser.role === "male" ? "female" : "male";

    const users = await User.find({ role: oppositeRole })
      .select("firstName lastName email role")
      .lean();

    // include friend status if exists
    const userWithStatus = users.map((u) => {
      const rel = currentUser.friends?.find(
        (f) => String(f.user) === String(u._id)
      );
      return { ...u, status: rel ? rel.status : "not_friends" };
    });

    res.json({ users: userWithStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
// Reject a friend request
export const rejectFriendRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const friendId = req.params.id;

    // Remove the pending request from both users
    await User.updateOne(
      { _id: userId },
      { $pull: { friends: { user: friendId } } }
    );

    await User.updateOne(
      { _id: friendId },
      { $pull: { friends: { user: userId } } }
    );

    res.json({ message: "Friend request rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Unfriend (remove friendship from both users)
export const unfriendUser = async (req, res) => {
  try {
    const userId = req.user._id;
    const friendId = req.params.id;

    if (String(userId) === String(friendId)) {
      return res.status(400).json({ message: "You cannot unfriend yourself" });
    }

    // Remove the relationship from both users regardless of status
    await User.updateOne(
      { _id: userId },
      { $pull: { friends: { user: friendId } } }
    );

    await User.updateOne(
      { _id: friendId },
      { $pull: { friends: { user: userId } } }
    );

    return res.json({ message: "Unfriended successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
