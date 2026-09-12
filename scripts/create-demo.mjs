import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile, mkdir, writeFile } from "node:fs/promises";
const fontPath = process.env.DEMO_FONT || "C:/Windows/Fonts/simhei.ttf";
const fontBytes = await readFile(fontPath);
const examples = [
  [
    "doc-2025-grain",
    "2025年粮食补贴申报指南",
    2,
    "2025年粮食补贴面向实际种粮农民发放。补贴标准由县级农业农村部门根据耕地面积和粮食产量核定，申请人应在村级公示期内提交身份证、土地承包证明和种粮面积证明。",
  ],
  [
    "doc-pig",
    "生猪标准化养殖补贴政策",
    5,
    "生猪标准化养殖补贴支持年出栏500头以上的规模养殖场。新建、改扩建圈舍及粪污处理设施可按投资额获得补助，具体标准以当年度项目申报通知为准。",
  ],
  [
    "doc-rural-shop",
    "农村电商示范县扶持办法",
    3,
    "农村电商示范县可申请物流共同配送、直播电商培训和农产品品牌建设资金。项目应建立农产品质量追溯体系，年度销售额达到申报通知规定的门槛。",
  ],
  [
    "doc-insurance",
    "农业保险理赔服务指引",
    4,
    "发生暴雨、洪涝等自然灾害后，被保险人应在48小时内向承保机构报案。农业保险理赔需要提供受灾地块信息、损失清单及现场照片，查勘后按照保险合同核定赔款。",
  ],
  [
    "doc-contract",
    "农村土地承包法普法手册",
    8,
    "农村土地承包经营权流转应当遵循依法、自愿、有偿原则。流转双方可以签订书面合同，乡镇农村土地承包管理部门提供备案和纠纷调解服务。",
  ],
  [
    "doc-tomato",
    "设施番茄绿色种植技术",
    6,
    "设施番茄定植后应控制夜间温度不低于12摄氏度，采用水肥一体化滴灌。发现晚疫病时及时通风降湿，并按照植保部门推荐方案用药。",
  ],
];
await mkdir("public/demo", { recursive: true });
for (const [id, title, count, text] of examples) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  for (let i = 1; i <= count; i++) {
    const page = pdf.addPage([595, 842]);
    page.drawText("乡村助农政策知识库 | 演示资料", {
      x: 50,
      y: 785,
      size: 12,
      font,
      color: rgb(0.18, 0.43, 0.29),
    });
    page.drawLine({
      start: { x: 50, y: 765 },
      end: { x: 545, y: 765 },
      color: rgb(0.7, 0.8, 0.73),
    });
    page.drawText(title, { x: 50, y: 710, size: 21, font });
    const content =
      i === count
        ? text
        : "本页为演示政策资料。内容仅用于软件功能验证，不构成真实政策依据。请以当地主管部门发布的正式文件为准。";
    const lines = content.match(/.{1,31}/gu) || [];
    lines.forEach((line, j) =>
      page.drawText(line, {
        x: 50,
        y: 650 - j * 29,
        size: 15,
        font,
        color: rgb(0.15, 0.2, 0.17),
      }),
    );
    page.drawText(`演示文件 · 第 ${i} 页`, {
      x: 50,
      y: 50,
      size: 10,
      font,
      color: rgb(0.5, 0.55, 0.52),
    });
  }
  await writeFile(`public/demo/${id}.pdf`, await pdf.save());
}
console.log("Created six Chinese demonstration PDFs.");
