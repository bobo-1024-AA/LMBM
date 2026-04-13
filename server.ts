import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // In-memory state
  let requests: any[] = [
    { id: 'req1', type: 'borrow', bookId: '1', bookTitle: { en: 'Brief Answers to the Big Questions', 'zh-HK': '霍金大問答' }, userId: '1', userName: 'Alex Harrison', status: 'pending', date: '2026-03-01 10:30' },
    { id: 'req2', type: 'return', bookId: '3', bookTitle: { en: 'The Art of War', 'zh-HK': '孫子兵法' }, userId: '2', userName: 'Sarah Miller', status: 'pending', date: '2026-03-02 14:20' },
  ];
  let notifications: any[] = [];
  // Initial borrowed books with due dates (14 days from now)
  const defaultDueDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString();
  };
  let userBooks: { id: string; dueDate: string }[] = [
    { id: "1", dueDate: defaultDueDate() },
    { id: "2", dueDate: defaultDueDate() },
  ];

  // WebSocket connections
  const clients = new Set<WebSocket>();
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
  });

  function broadcast(data: any) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // API Routes
  app.get("/api/state", (req, res) => {
    res.json({ requests, notifications, userBooks });
  });

  // User submits a request
  app.post("/api/requests", (req, res) => {
    const { type, bookId, bookTitle, userId, userName, days } = req.body;
    const newRequest = {
      id: Math.random().toString(36).substr(2, 9),
      type, // 'borrow' | 'renew'
      bookId,
      bookTitle,
      userId,
      userName,
      days: days || (type === 'renew' ? 7 : 14),
      status: "pending",
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    requests.push(newRequest);
    broadcast({ type: "NEW_REQUEST", request: newRequest, requests });
    res.status(201).json(newRequest);
  });

  // Admin approves/rejects a request
  app.post("/api/admin/approve", (req, res) => {
    try {
      const { requestId, status } = req.body; // status: 'approved' | 'rejected'
      const requestIndex = requests.findIndex((r) => r.id === requestId);
      if (requestIndex === -1) return res.status(404).json({ error: "Request not found" });

      const request = requests[requestIndex];
      request.status = status;

      // If approved, update user's books and set initial tracking status
      if (status === "approved") {
        if (request.type === "borrow") {
          request.trackingStatus = 'approved';
          if (!userBooks.find(b => b.id === request.bookId)) {
            // Add book with NO due date initially, will be set on delivery
            userBooks.push({ id: request.bookId, dueDate: null as any });
          }
        } else if (request.type === "return") {
          request.trackingStatus = 'please_send';
          // We don't remove the book from userBooks yet, wait until delivered
        } else if (request.type === "renew") {
          const book = userBooks.find(b => b.id === request.bookId);
          if (book) {
            const currentDueDate = new Date(book.dueDate);
            currentDueDate.setDate(currentDueDate.getDate() + (request.days || 7));
            book.dueDate = currentDueDate.toISOString();
          }
        }
      }

      const bookTitle = request.bookTitle || { en: 'Unknown Book', 'zh-HK': '未知書籍' };
      const bookTitleEn = typeof bookTitle === 'string' ? bookTitle : (bookTitle.en || 'Unknown Book');
      const bookTitleZh = typeof bookTitle === 'string' ? bookTitle : (bookTitle['zh-HK'] || '未知書籍');

      // Create notification for user
      const notification = {
        id: Math.random().toString(36).substr(2, 9),
        userId: request.userId,
        title: {
          en: `${request.type === "borrow" ? "Borrowing" : request.type === "renew" ? "Renewal" : "Return"} ${status === "approved" ? "Successful" : "Failed"}`,
          'zh-HK': `${request.type === "borrow" ? "借閱" : request.type === "renew" ? "續借" : "歸還"} ${status === "approved" ? "成功" : "失敗"}`
        },
        message: {
          en: `Your request for "${bookTitleEn}" has been ${status}.`,
          'zh-HK': `您對《${bookTitleZh}》的申請已${status === "approved" ? "通過" : "被拒絕"}。`
        },
        type: status === "approved" ? "success" : "error",
        timestamp: new Date().toISOString(),
        isRead: false,
      };
      notifications.push(notification);

      // Remove from pending requests ONLY if rejected or renew
      if (status === "rejected" || request.type === "renew") {
        requests.splice(requestIndex, 1);
      }

      broadcast({ type: "REQUEST_PROCESSED", requestId, status, notification, userBooks, requests });
      res.json({ success: true });
    } catch (error) {
      console.error("Error in /api/admin/approve:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin updates tracking status
  app.post("/api/admin/update-tracking", (req, res) => {
    try {
      const { requestId, trackingStatus } = req.body;
      const request = requests.find((r) => r.id === requestId);
      if (!request) return res.status(404).json({ error: "Request not found" });

      const oldStatus = request.trackingStatus;
      request.trackingStatus = trackingStatus;

      // If return is delivered, update user's books
      if (request.type === "return" && trackingStatus === "delivered") {
        userBooks = userBooks.filter((b) => b.id !== request.bookId);
        request.completedAt = new Date().toISOString();
      }
      
      // If borrow is delivered, set the due date
      if (request.type === "borrow" && trackingStatus === "delivered") {
        const book = userBooks.find(b => b.id === request.bookId);
        if (book) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (request.days || 14));
          book.dueDate = dueDate.toISOString();
        }
        request.completedAt = new Date().toISOString();
      }

      // Create notification for status change
      const bookTitle = request.bookTitle || { en: 'Unknown Book', 'zh-HK': '未知書籍' };
      const bookTitleEn = typeof bookTitle === 'string' ? bookTitle : (bookTitle.en || 'Unknown Book');
      const bookTitleZh = typeof bookTitle === 'string' ? bookTitle : (bookTitle['zh-HK'] || '未知書籍');
      
      const statusMap: Record<string, { en: string, 'zh-HK': string }> = {
        'waiting_to_send': { en: 'Waiting to be Sent', 'zh-HK': '等待寄出' },
        'sent': { en: 'Sent', 'zh-HK': '已寄出' },
        'delivered': { en: 'Delivered', 'zh-HK': '已送達' },
        'please_send': { en: 'Please Send Book', 'zh-HK': '請寄出書籍' }
      };

      const statusNames = statusMap[trackingStatus] || { en: trackingStatus, 'zh-HK': trackingStatus };

      const notification = {
        id: Math.random().toString(36).substr(2, 9),
        userId: request.userId,
        title: {
          en: `Status Update: ${statusNames.en}`,
          'zh-HK': `狀態更新：${statusNames['zh-HK']}`
        },
        message: {
          en: `The status of your request for "${bookTitleEn}" has changed to ${statusNames.en}.`,
          'zh-HK': `您對《${bookTitleZh}》的申請狀態已更改為「${statusNames['zh-HK']}」。`
        },
        type: "info",
        timestamp: new Date().toISOString(),
        isRead: false,
      };
      notifications.push(notification);

      // Filter out requests older than 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      requests = requests.filter(r => !r.completedAt || new Date(r.completedAt) > sevenDaysAgo);

      broadcast({ type: "TRACKING_UPDATED", requestId, trackingStatus, userBooks, requests, notification });
      res.json({ success: true });
    } catch (error) {
      console.error("Error in /api/admin/update-tracking:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User returns a book - change to create a request instead of immediate removal
  app.post("/api/return", (req, res) => {
    const { bookId, bookTitle, userId, userName } = req.body;
    
    const newRequest = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'return',
      bookId,
      bookTitle,
      userId,
      userName,
      status: "pending",
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    requests.push(newRequest);
    broadcast({ type: "NEW_REQUEST", request: newRequest, requests });
    res.status(201).json(newRequest);
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global error handler caught:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
