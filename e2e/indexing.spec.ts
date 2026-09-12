import {test,expect} from '@playwright/test';
test('upload is processed asynchronously and refresh persists',async({page})=>{
 await page.goto('/login');await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('123456');await page.getByRole('button',{name:'登录后台'}).click();await page.getByRole('link',{name:'文档管理'}).click();
 await page.locator('input[type=file]').setInputFiles('public/demo/doc-tomato.pdf');await page.getByRole('button',{name:'上传文件',exact:true}).click();const row=page.getByRole('row').filter({hasText:'doc-tomato.pdf'});await expect(row.getByText('上传完成',{exact:true})).toBeVisible({timeout:45000});await page.reload();await expect(page.getByRole('row').filter({hasText:'doc-tomato.pdf'})).toBeVisible();
 await expect(page.getByRole('columnheader',{name:'版本',exact:true})).toHaveCount(0);
});
test('virtual list mounts a bounded number of rows and follows streaming',async({page})=>{
 await page.goto('/e2e/virtual-list.html');await expect(page.getByTestId('message').last()).toContainText('记录 1000');expect(await page.getByTestId('message').count()).toBeLessThan(25);await page.getByRole('button',{name:'开始测试流'}).click();await expect(page.getByTestId('message').last()).toContainText('新的政策片段');await page.getByRole('button',{name:'停止测试流'}).click();
});
test('mobile layout keeps navigation and document controls usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/visitor');await page.getByRole('button',{name:'打开导航'}).click();await page.getByRole('link',{name:'惠农补贴政策',exact:true}).click();await page.getByRole('button',{name:'知识库文档',exact:true}).click();await expect(page.getByRole('textbox',{name:'搜索文档'})).toBeVisible();await page.getByRole('button',{name:'关闭文档列表'}).click();await expect(page.getByRole('textbox',{name:'政策问题'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
