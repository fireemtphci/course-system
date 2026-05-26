const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB_INSTRUCTORS = process.env.DB_INSTRUCTORS;
const DB_COURSES = process.env.DB_COURSES;
const DB_ENROLLMENTS = process.env.DB_ENROLLMENTS;
const DB_NOTIFICATIONS = process.env.DB_NOTIFICATIONS;

const headers = {
  "Authorization": `Bearer ${NOTION_TOKEN}`,
  "Content-Type": "application/json",
  "Notion-Version": "2022-06-28"
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

async function notion(path, method = "GET", body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.notion.com/v1${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || JSON.stringify(json));
  return json;
}

function getText(prop) {
  return prop?.rich_text?.[0]?.plain_text || "";
}
function getTitle(prop) {
  return prop?.title?.[0]?.plain_text || "";
}
function getSelect(prop) {
  return prop?.select?.name || "";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }

  let action, data;
  try {
    const parsed = JSON.parse(event.body || "{}");
    action = parsed.action;
    data = parsed.data || {};
  } catch(e) {
    return { statusCode: 400, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ success: false, error: "Invalid JSON" }) };
  }

  try {
    let result;

    if (action === "getInstructors") {
      const res = await notion(`/databases/${DB_INSTRUCTORS}/query`, "POST", {
        filter: { property: "狀態", select: { equals: "啟用" } }
      });
      result = res.results.map(p => ({
        id: p.id,
        name: getTitle(p.properties["名稱"]),
        email: p.properties["Email"]?.email || "",
        password: getText(p.properties["密碼"]),
        title: getText(p.properties["職稱"]),
        status: getSelect(p.properties["狀態"])
      }));
    }

    else if (action === "getPendingInstructors") {
      const res = await notion(`/databases/${DB_INSTRUCTORS}/query`, "POST", {
        filter: { property: "狀態", select: { equals: "待審" } }
      });
      result = res.results.map(p => ({
        id: p.id,
        name: getTitle(p.properties["名稱"]),
        email: p.properties["Email"]?.email || "",
        title: getText(p.properties["職稱"]),
        applyDate: getText(p.properties["申請日期"]),
        status: getSelect(p.properties["狀態"])
      }));
    }

    else if (action === "applyInstructor") {
      result = await notion("/pages", "POST", {
        parent: { database_id: DB_INSTRUCTORS },
        properties: {
          "名稱": { title: [{ text: { content: data.name } }] },
          "Email": { email: data.email },
          "密碼": { rich_text: [{ text: { content: data.password } }] },
          "職稱": { rich_text: [{ text: { content: data.title || "" } }] },
          "申請日期": { rich_text: [{ text: { content: data.applyDate } }] },
          "狀態": { select: { name: "待審" } }
        }
      });
    }

    else if (action === "approveInstructor") {
      result = await notion(`/pages/${data.id}`, "PATCH", {
        properties: { "狀態": { select: { name: "啟用" } } }
      });
    }

    else if (action === "rejectInstructor") {
      result = await notion(`/pages/${data.id}`, "PATCH", {
        properties: { "狀態": { select: { name: "停用" } } }
      });
    }

    else if (action === "getCourses") {
      const res = await notion(`/databases/${DB_COURSES}/query`, "POST", {
        sorts: [{ property: "日期", direction: "ascending" }]
      });
      result = res.results.map(p => ({
        id: p.id,
        name: getTitle(p.properties["名稱"]),
        date: p.properties["日期"]?.date?.start || "",
        time: getSelect(p.properties["時段"]),
        location: getText(p.properties["地點"]),
        quota: p.properties["名額"]?.number || 0
      }));
    }

    else if (action === "addCourse") {
      result = await notion("/pages", "POST", {
        parent: { database_id: DB_COURSES },
        properties: {
          "名稱": { title: [{ text: { content: data.name } }] },
          "日期": { date: { start: data.date } },
          "時段": { select: { name: data.time } },
          "地點": { rich_text: [{ text: { content: data.location } }] },
          "名額": { number: parseInt(data.quota) }
        }
      });
    }

    else if (action === "deleteCourse") {
      result = await notion(`/pages/${data.id}`, "PATCH", { archived: true });
    }

    else if (action === "getEnrollments") {
      const res = await notion(`/databases/${DB_ENROLLMENTS}/query`, "POST", {});
      result = res.results.map(p => ({
        id: p.id,
        instructorEmail: getText(p.properties["教官Email"]),
        courseName: getText(p.properties["課程名稱"]),
        enrollTime: p.properties["選課時間"]?.date?.start || ""
      }));
    }

    else if (action === "enroll") {
      result = await notion("/pages", "POST", {
        parent: { database_id: DB_ENROLLMENTS },
        properties: {
          "名稱": { title: [{ text: { content: `${data.instructorEmail}-${data.courseName}` } }] },
          "教官Email": { rich_text: [{ text: { content: data.instructorEmail } }] },
          "課程名稱": { rich_text: [{ text: { content: data.courseName } }] },
          "選課時間": { date: { start: new Date().toISOString() } }
        }
      });
    }

    else if (action === "unenroll") {
      result = await notion(`/pages/${data.id}`, "PATCH", { archived: true });
    }

    else if (action === "getNotifications") {
      const res = await notion(`/databases/${DB_NOTIFICATIONS}/query`, "POST", {
        sorts: [{ timestamp: "created_time", direction: "descending" }]
      });
      result = res.results.map(p => ({
        id: p.id,
        title: getTitle(p.properties["名稱"]),
        content: getText(p.properties["內容"]),
        target: getText(p.properties["對象"]),
        time: p.properties["時間"]?.date?.start || ""
      }));
    }

    else if (action === "addNotification") {
      result = await notion("/pages", "POST", {
        parent: { database_id: DB_NOTIFICATIONS },
        properties: {
          "名稱": { title: [{ text: { content: data.title } }] },
          "內容": { rich_text: [{ text: { content: data.content } }] },
          "對象": { rich_text: [{ text: { content: data.target } }] },
          "時間": { date: { start: new Date().toISOString() } }
        }
      });
    }

    else {
      throw new Error("Unknown action: " + action);
    }

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, data: result })
    };

  } catch (err) {
    console.error("Error:", err.message);
    return {
      statusCode: 500,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
[build]
  functions = "."
  publish = "."

[[redirects]]
  from = "/api/notion"
  to = "/.netlify/functions/notion"
  status = 200
