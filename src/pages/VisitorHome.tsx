import { Bell, ArrowUpRight, FileText, Leaf } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useData } from "../stores/data";
import { categoryIcons } from "../components/Layout";
import { useState } from "react";
import type { Announcement } from "../types";
export function VisitorHome() {
  const nav = useNavigate();
  const { categories, documents, announcements } = useData();
  const [detail, setDetail] = useState<Announcement>();
  return (
    <div className="home-content">
      <div className="home-heading">
        <div className="eyebrow">乡村助农 · 政策服务</div>
        <h1>惠农政策，随时查问</h1>
        <p>从补贴申报到科学种植，找到与你有关的政策资料。</p>
      </div>
      <section className="service-band">
        <img src="/countryside.jpg" alt="田间的绿色作物" />
        <div>
          <Leaf size={22} />
          <h2>乡村助农政策知识库</h2>
          <p>五大知识板块 · 原文引用溯源</p>
        </div>
      </section>
      <section className="home-section">
        <div className="section-heading">
          <h2>选择知识板块</h2>
          <span>{documents.length} 份政策资料</span>
        </div>
        <div className="category-grid">
          {categories.map((c, i) => {
            const Icon = categoryIcons[i % categoryIcons.length];
            return (
              <button
                key={c.id}
                className={`category-card color-${i % 5}`}
                onClick={() => nav(`/visitor/chat/${c.id}`)}
              >
                <div className="category-card-top">
                  <span className="category-icon">
                    <Icon size={24} />
                  </span>
                  <ArrowUpRight size={18} />
                </div>
                <h3>{c.name}</h3>
                <p>{c.description}</p>
                <span className="category-count">
                  <FileText size={13} />
                  {documents.filter((d) => d.categoryId === c.id).length} 份资料
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="home-section">
        <div className="section-heading">
          <h2>
            <Bell size={18} />
            最新公告
          </h2>
          <span>{announcements.filter((a) => a.isPublished).length} 条</span>
        </div>
        {announcements
          .filter((a) => a.isPublished)
          .map((a) => (
            <button
              className="announcement-row"
              key={a.id}
              onClick={() => setDetail(a)}
            >
              <span className="announcement-date">
                {new Date(a.createdAt).toLocaleDateString("zh-CN")}
              </span>
              <strong>{a.title}</strong>
              <ArrowUpRight size={16} />
            </button>
          ))}
      </section>
      {detail && (
        <div className="drawer-backdrop" onClick={() => setDetail(undefined)}>
          <article
            className="announcement-modal"
            role="dialog"
            aria-modal="true"
            aria-label="公告详情"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{detail.title}</h2>
            <p>{detail.content}</p>
            <button
              className="secondary-button"
              onClick={() => setDetail(undefined)}
            >
              关闭
            </button>
          </article>
        </div>
      )}
    </div>
  );
}
