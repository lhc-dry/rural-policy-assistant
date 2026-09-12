import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  App,
  Button,
  ConfigProvider,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
  message as toast,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  Plus,
  Trash2,
  RefreshCw,
  Upload as UploadIcon,
  Move,
  Save,
  Pencil,
  Megaphone,
} from "lucide-react";
import * as echarts from "echarts";
import "echarts-wordcloud";
import { api } from "../api/http";
import { useData } from "../stores/data";
import type {
  Announcement,
  Category,
  KnowledgeDocument,
  Statistics,
} from "../types";
import { PdfPreview } from "../components/PdfPreview";
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{ token: { colorPrimary: "#27744d", borderRadius: 6 } }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
const fail = (e: unknown) =>
  void toast.error(e instanceof Error ? e.message : String(e));
export function Dashboard() {
  const { documents } = useData();
  const [stats, setStats] = useState<Statistics[]>([]),
    [error, setError] = useState("");
  const chart = useRef<HTMLDivElement>(null),
    cloud = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const load = () =>
    void api
      .get<Statistics[]>("/admin/statistics")
      .then((r) => {
        setStats(r.data);
        setError("");
      })
      .catch((e) => setError(String(e)));
  useEffect(load, []);
  useEffect(() => {
    if (!chart.current || !cloud.current) return;
    const bar = echarts.init(chart.current),
      word = echarts.init(cloud.current);
    bar.setOption({
      color: ["#348864"],
      grid: { left: 130, right: 20, top: 20, bottom: 30 },
      tooltip: {},
      xAxis: { type: "value", minInterval: 1 },
      yAxis: {
        type: "category",
        inverse: true,
        data: stats
          .slice(0, 8)
          .map((s) =>
            s.question.length > 10 ? s.question.slice(0, 10) + "…" : s.question,
          ),
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 24,
          data: stats.slice(0, 8).map((s) => s.count),
        },
      ],
    });
    word.setOption({
      series: [
        {
          type: "wordCloud",
          shape: "circle",
          sizeRange: [14, 36],
          rotationRange: [0, 0],
          textStyle: {
            color: () =>
              ["#27744d", "#367aac", "#a45661"][Math.floor(Math.random() * 3)],
          },
          data: stats
            .slice(0, 30)
            .map((s) => ({ name: s.question, value: s.count })),
        },
      ],
    });
    const observer = new ResizeObserver(() => {
      bar.resize();
      word.resize();
    });
    observer.observe(chart.current);
    observer.observe(cloud.current);
    return () => {
      observer.disconnect();
      bar.dispose();
      word.dispose();
    };
  }, [stats]);
  return (
    <Shell>
      <div className="page-title">
        <div>
          <div className="eyebrow">运营概览</div>
          <h1>数据看板</h1>
        </div>
        <Button icon={<RefreshCw size={15} />} onClick={load}>
          刷新
        </Button>
      </div>
      {error && <div className="notice danger">{error}</div>}
      <div className="metric-grid">
        <div>
          <span>知识库文档</span>
          <strong>{documents.length}</strong>
        </div>
        <div>
          <span>总提问次数</span>
          <strong>{stats.reduce((s, r) => s + r.count, 0)}</strong>
        </div>
        <div>
          <span>有效反馈</span>
          <strong>{stats.reduce((s, r) => s + r.feedbackCount, 0)}</strong>
        </div>
        <div>
          <span>热点问题</span>
          <strong>{stats.filter((s) => s.hot).length}</strong>
        </div>
      </div>
      <div className="chart-grid">
        <section>
          <h2>提问次数排行</h2>
          <div ref={chart} style={{ height: 280 }} />
          {!stats.length && <p className="muted">暂无提问记录</p>}
        </section>
        <section>
          <h2>高频问题词云</h2>
          <div ref={cloud} style={{ height: 280 }} />
        </section>
      </div>
      <Table
        rowKey="question"
        dataSource={stats}
        pagination={{ pageSize: 8 }}
        scroll={{ x: 720 }}
        columns={[
          { title: "问题", dataIndex: "question" },
          { title: "次数", dataIndex: "count", width: 70 },
          {
            title: "反馈覆盖率",
            render: (_, s) => `${Math.round(s.coverage * 100)}%`,
            width: 110,
          },
          {
            title: "无用占比",
            render: (_, s) =>
              s.feedbackCount
                ? `${Math.round(s.uselessRate * 100)}%`
                : "未评价",
            width: 100,
          },
          {
            title: "热点",
            render: (_, s) => (s.hot ? <Tag color="green">热点</Tag> : "-"),
            width: 80,
          },
          {
            title: "操作",
            render: (_, s) => (
              <Button
                icon={<Megaphone size={14} />}
                onClick={() =>
                  nav("/admin/announcements", {
                    state: { question: s.question },
                  })
                }
              >
                创建公告
              </Button>
            ),
            width: 140,
          },
        ]}
      />
    </Shell>
  );
}
export function Documents() {
  const { categories, documents, reload } = useData();
  const [selected, setSelected] = useState<React.Key[]>([]),
    [categoryId, setCategoryId] = useState(""),
    [filter, setFilter] = useState(""),
    [file, setFile] = useState<File>(),
    [updating, setUpdating] = useState<KnowledgeDocument>(),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<KnowledgeDocument>(),
    [editing, setEditing] = useState<KnowledgeDocument>(),
    [name, setName] = useState(""),
    [categoryEditor, setCategoryEditor] = useState(false),
    [category, setCategory] = useState<Category>();
  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);
  useEffect(() => {
    if (!documents.some((document) => document.processingStatus === "processing")) return;
    const timer = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(timer);
  }, [documents, reload]);
  const options = categories.map((c) => ({ value: c.id, label: c.name }));
  const execute = async (
    action: () => Promise<unknown>,
    successMessage = "文件已保存，后台正在处理",
  ) => {
    setBusy(true);
    try {
      await action();
      await reload();
      void toast.success(successMessage);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const upload = () =>
    execute(async () => {
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      form.append("categoryId", updating?.categoryId || categoryId);
      if (updating) form.append("id", updating.id);
      if (updating) await api.patch(`/admin/documents/${updating.id}`, form);
      else await api.post("/admin/documents", form);
      setFile(undefined);
      setUpdating(undefined);
    });
  const remove = (ids: React.Key[]) =>
    execute(async () => {
      await api.delete("/admin/documents", { data: { ids } });
      setSelected([]);
    }, "文件已删除");
  return (
    <Shell>
      <div className="page-title">
        <div>
          <div className="eyebrow">知识库维护</div>
          <h1>文档管理</h1>
        </div>
        <Button
          icon={<Plus size={16} />}
          onClick={() => setCategoryEditor(true)}
        >
          分类管理
        </Button>
      </div>
      <div className="admin-upload">
        <Select
          aria-label="上传所属板块"
          value={categoryId}
          options={options}
          onChange={setCategoryId}
          style={{ width: 190 }}
        />
        <Upload
          accept=".pdf,application/pdf"
          maxCount={1}
          fileList={file ? [{ uid: "upload", name: file.name }] : []}
          beforeUpload={(f) => {
            if (f.type !== "application/pdf" || !/\.pdf$/i.test(f.name)) {
              void toast.error("仅支持 PDF 文件");
              return Upload.LIST_IGNORE;
            }
            setFile(f);
            return false;
          }}
          onRemove={() => setFile(undefined)}
        >
          <Button icon={<UploadIcon size={16} />}>选择 PDF</Button>
        </Upload>
        <Button
          type="primary"
          loading={busy}
          disabled={!file || !categoryId}
          icon={<UploadIcon size={16} />}
          onClick={() => void upload()}
        >
          {updating ? "更新文件" : "上传文件"}
        </Button>
        {updating && (
          <Button onClick={() => setUpdating(undefined)}>
            取消更新 {updating.fileName}
          </Button>
        )}
      </div>
      <div className="admin-toolbar">
        <Input.Search
          placeholder="搜索文件名"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <span className="muted">已选 {selected.length} 项</span>
        <Popconfirm title="删除所选文件？" onConfirm={() => remove(selected)}>
          <Button
            danger
            disabled={!selected.length}
            icon={<Trash2 size={15} />}
          >
            批量删除
          </Button>
        </Popconfirm>
        <Button
          disabled={!selected.length}
          icon={<Move size={15} />}
          onClick={() =>
            void execute(async () => {
              await Promise.all(
                selected.map((id) =>
                  api.patch(`/admin/documents/${String(id)}`, { categoryId }),
                ),
              );
              setSelected([]);
            })
          }
        >
          移动至所选板块
        </Button>
      </div>
      <Table
        rowKey="id"
        dataSource={documents.filter((d) => d.fileName.includes(filter))}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
        pagination={{ pageSize: 8 }}
        scroll={{ x: 960 }}
        columns={[
          {
            title: "文件名",
            dataIndex: "fileName",
            render: (_, d) => (
              <button className="table-link" onClick={() => setPreview(d)}>
                {d.fileName}
              </button>
            ),
          },
          {
            title: "所属板块",
            render: (_, d) =>
              categories.find((c) => c.id === d.categoryId)?.name,
            width: 150,
          },
          {
            title: "上传时间",
            render: (_, d) =>
              new Date(d.uploadTime).toLocaleDateString("zh-CN"),
            width: 115,
          },
          {
            title: "处理状态",
            render: (_, d) => (
              <span title={d.processingMessage}>
                <Tag
                  color={
                    d.processingStatus === "uploaded"
                      ? "green"
                      : d.processingStatus === "failed"
                        ? "red"
                        : "default"
                  }
                >
                  {d.processingStatus === "uploaded"
                    ? "上传完成"
                    : d.processingStatus === "failed"
                      ? "处理失败"
                      : "处理中"}
                </Tag>
                {d.processingMessage && <small>{d.processingMessage}</small>}
                {d.processingStatus === "failed" && (
                  <Button
                    size="small"
                    type="link"
                    onClick={() =>
                      void execute(() =>
                        api.post(`/admin/documents/${d.id}/reprocess`),
                      )
                    }
                  >
                    重新处理
                  </Button>
                )}
              </span>
            ),
            width: 180,
          },
          {
            title: "操作",
            width: 150,
            render: (_, d) => (
              <Space>
                <Button
                  type="text"
                  title="编辑名称"
                  aria-label={`编辑 ${d.fileName}`}
                  icon={<Pencil size={15} />}
                  onClick={() => {
                    setEditing(d);
                    setName(d.fileName);
                  }}
                />
                <Button
                  type="text"
                  title="更新文件"
                  aria-label={`更新 ${d.fileName}`}
                  icon={<UploadIcon size={15} />}
                  onClick={() => {
                    setUpdating(d);
                    setCategoryId(d.categoryId);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
                <Popconfirm
                  title="删除此文件？"
                  onConfirm={() => remove([d.id])}
                >
                  <Button
                    danger
                    type="text"
                    title="删除"
                    icon={<Trash2 size={15} />}
                  />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title="编辑文件名"
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={() =>
          void execute(async () => {
            if (!name.trim()) throw new Error("名称不能为空");
            await api.patch(`/admin/documents/${editing!.id}`, {
              fileName: name,
            });
            setEditing(undefined);
          })
        }
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>
      <Modal
        title="分类管理"
        open={categoryEditor}
        footer={null}
        onCancel={() => {
          setCategoryEditor(false);
          setCategory(undefined);
        }}
      >
        {categories.map((c) => (
          <div key={c.id} className="category-row">
            <span>{c.name}</span>
            <Button size="small" onClick={() => setCategory(c)}>
              编辑
            </Button>
            <Popconfirm
              title="删除分类？非空分类需先迁移文档。"
              onConfirm={() =>
                execute(
                  () => api.delete(`/admin/categories/${c.id}`),
                  "分类已删除",
                )
              }
            >
              <Button size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </div>
        ))}
        <Button
          icon={<Plus size={14} />}
          onClick={() =>
            setCategory({
              id: crypto.randomUUID(),
              name: "",
              description: "",
              icon: "leaf",
            })
          }
        >
          新增分类
        </Button>
        {category && (
          <div className="category-form">
            <Input
              placeholder="分类名称"
              value={category.name}
              onChange={(e) =>
                setCategory({ ...category, name: e.target.value })
              }
            />
            <Input
              placeholder="分类简介"
              value={category.description}
              onChange={(e) =>
                setCategory({ ...category, description: e.target.value })
              }
            />
            <Button
              type="primary"
              onClick={() =>
                void execute(async () => {
                  await api.post("/admin/categories", category);
                  setCategory(undefined);
                })
              }
            >
              保存分类
            </Button>
          </div>
        )}
      </Modal>
      {preview && (
        <PdfPreview document={preview} onClose={() => setPreview(undefined)} />
      )}
    </Shell>
  );
}
export function Announcements() {
  const { announcements, categories, reload } = useData();
  const location = useLocation();
  const blank = (): Announcement => ({
    id: crypto.randomUUID(),
    title: (location.state as { question?: string } | null)?.question || "",
    content: "",
    createdAt: new Date().toISOString(),
    isPublished: false,
  });
  const [form, setForm] = useState<Announcement>(blank),
    [busy, setBusy] = useState(false);
  const save = async (published: boolean) => {
    setBusy(true);
    try {
      await api.post("/admin/announcements", {
        ...form,
        isPublished: published,
      });
      await reload();
      setForm({ ...blank(), title: "" });
      void toast.success(published ? "公告已发布" : "草稿已保存");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <div className="page-title">
        <div>
          <div className="eyebrow">政策通知</div>
          <h1>公告管理</h1>
        </div>
      </div>
      <section className="announcement-editor">
        <Input
          aria-label="公告标题"
          placeholder="公告标题"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          maxLength={120}
        />
        <Select
          aria-label="公告所属板块"
          value={form.categoryId || ""}
          options={[
            { value: "", label: "全部板块" },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={(v) => setForm({ ...form, categoryId: v || undefined })}
        />
        <Input.TextArea
          aria-label="公告内容"
          placeholder="公告内容"
          rows={5}
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />
        <Space>
          <Button
            loading={busy}
            icon={<Save size={15} />}
            onClick={() => void save(false)}
          >
            保存草稿
          </Button>
          <Button
            type="primary"
            loading={busy}
            icon={<Megaphone size={15} />}
            onClick={() => void save(true)}
          >
            发布公告
          </Button>
        </Space>
      </section>
      <Table
        rowKey="id"
        dataSource={announcements}
        pagination={{ pageSize: 8 }}
        scroll={{ x: 650 }}
        columns={[
          { title: "标题", dataIndex: "title" },
          {
            title: "板块",
            render: (_, a) =>
              categories.find((c) => c.id === a.categoryId)?.name || "全部板块",
          },
          {
            title: "发布状态",
            render: (_, a) => (
              <Switch
                checkedChildren="已发布"
                unCheckedChildren="草稿"
                checked={a.isPublished}
                onChange={(v) =>
                  void api
                    .post("/admin/announcements", { ...a, isPublished: v })
                    .then(reload)
                    .catch(fail)
                }
              />
            ),
          },
          {
            title: "操作",
            render: (_, a) => (
              <Space>
                <Button icon={<Pencil size={14} />} onClick={() => setForm(a)}>
                  编辑
                </Button>
                <Popconfirm
                  title="删除公告？"
                  onConfirm={() =>
                    api
                      .delete(`/admin/announcements/${a.id}`)
                      .then(reload)
                      .catch(fail)
                  }
                >
                  <Button danger icon={<Trash2 size={14} />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </Shell>
  );
}

