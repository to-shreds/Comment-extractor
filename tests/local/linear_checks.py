import asyncio, json, zipfile, re, time, traceback
from pathlib import Path
from playwright.async_api import async_playwright
from linear_harness import load_local
from generate_fixture import fixture, ROOT
RESULTS=[]
async def info(p):return await p.evaluate('window.CommentMasterWord.workflowInfo()')
async def snap(p):return await p.evaluate('window.CommentMasterWord.snapshot()')
async def jump(p,key):
 if await p.locator('#linear-sidebar-toggle').is_visible() and not await p.locator(f'[data-linear-jump="{key}"]').is_visible():await p.locator('#linear-sidebar-toggle').click()
 await p.locator(f'[data-linear-jump="{key}"]').click()
async def openfile(p,path=None):
 await jump(p,'file')
 async with p.expect_file_chooser() as choose:await p.locator('#linear-upload').click()
 await (await choose.value).set_files(str(path or ROOT/'linear-fixture.docx'))
 await p.wait_for_function('() => !!window.CommentMasterWord.workflowInfo()')
 await p.wait_for_timeout(60)
async def rename(p,name='Changed Reviewer',scope='all'):
 await jump(p,'names');await p.locator('#linear-name-from').select_option('__all__');await p.locator('#linear-name-scope').select_option(scope)
 await p.locator('#linear-name-to').fill(name);await p.locator('[data-linear-action="names"]').click()
 await p.wait_for_timeout(50)
async def summary(p,filename,append=False):
 await jump(p,'download');await p.locator('#linear-download-summary').click()
 await p.locator('#summary-original').set_checked(append)
 async with p.expect_download() as d:await p.locator('#summary-download').click()
 await (await d.value).save_as(str(ROOT/filename));await p.wait_for_timeout(60)
 return ROOT/filename
async def test(b,name,fn,width=1440):
 page=await b.new_page(viewport={'width':width,'height':1000 if width>800 else 844},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 start=time.time()
 try:
  await load_local(page);await fn(page)
  assert not errors,errors
  RESULTS.append({'test':name,'passed':True,'seconds':round(time.time()-start,2)})
  print('PASS',name)
 except Exception as e:
  RESULTS.append({'test':name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'pageerrors':errors});print('FAIL',name,traceback.format_exc())
  await page.screenshot(path=str(ROOT/('failure-'+re.sub('[^a-z0-9]','-',name.lower())+'.png')),full_page=True)
 finally:await page.close()
async def initial(p):
 assert await p.locator('[data-linear-section]').count()==9
 assert await p.locator('#linear-download-document').is_disabled()
 assert await p.locator('#linear-download-summary').is_disabled()
 assert await p.locator('#linear-section-file').get_attribute('open') is not None
 await openfile(p)
 i=await info(p);assert not i['dirty'] and i['version']==0 and i['activity']=={},i
 assert await p.locator('[data-nav-status="file"]').inner_text()=='Loaded'
 assert await p.locator('#linear-name-from option').count()==4
async def status_undo(p):
 await openfile(p);await jump(p,'times')
 assert await p.locator('[data-nav-status="times"]').inner_text()=='Not used'
 await rename(p)
 assert (await info(p))['activity']=={'names':1}
 assert await p.locator('[data-nav-status="names"]').inner_text()=='Applied'
 await p.locator('#linear-undo').click()
 assert (await info(p))['activity']=={}
 assert {i['author'] for i in (await snap(p))['items']}=={'Alex Smith','Jordan Lee'}
 assert await p.locator('[data-nav-status="names"]').inner_text()=='Not used'
async def manual(p):
 await openfile(p);await jump(p,'review');await p.locator('#data-table').wait_for(state='visible')
 row=p.locator('#data-body tr').filter(has=p.locator('[aria-label="Comment text for 0"]'))
 await row.locator('[data-field="author"]').fill('Manual Reviewer');await p.locator('#linear-review-search').click()
 text=row.locator('[data-field="text"]');await text.fill('Revised comment text.');await p.locator('#linear-review-search').click()
 data=await snap(p);com=next(i for i in data['items'] if i['type']=='com');assert com['text']=='Revised comment text.' and com['author']=='Manual Reviewer',com
 assert (await info(p))['activity'].get('review')
 await jump(p,'find');await p.locator('#view-regex').wait_for(state='visible');assert await p.locator('#data-table').is_visible()
 await p.locator('#linear-section-find > summary').click();assert await p.locator('#data-table').is_visible()
async def dates_metadata(p):
 await openfile(p);await jump(p,'times')
 await p.locator('#linear-time-mode').select_option('set');await p.locator('#linear-time-date').fill('2026-11-09T10:15:30');await p.locator('[data-linear-action="times"]').click()
 assert all('10:15:30' in i['date'] for i in (await snap(p))['items'])
 assert (await info(p))['activity'].get('times')
 await p.locator('#linear-time-mode').select_option('shift');await p.locator('#linear-time-minutes').fill('5');await p.locator('[data-linear-action="times"]').click()
 assert all('10:20:30' in i['date'] for i in (await snap(p))['items'])
 await p.locator('#linear-time-mode').select_option('clear');await p.locator('#linear-time-scope').select_option('comments');await p.locator('[data-linear-action="times"]').click()
 assert next(i for i in (await snap(p))['items'] if i['type']=='com')['date']==''
 await jump(p,'metadata');p.once('dialog',lambda d:asyncio.create_task(d.accept()));await p.locator('[data-linear-action="metadata"]').click()
 i=await info(p);assert i['activity'].get('metadata');assert not i['metadata']['creator'];assert i['comments']==1 and i['redlines']==2
async def defaults(p):
 await openfile(p);await jump(p,'download');await p.locator('#linear-download-summary').click()
 o=await p.evaluate('window.CommentMasterLinear.summaryOptions()');assert o['comments'] and o['redlines'] and not o['includeOriginal'] and len(o['columns'])==8,o
 await p.locator('#summary-comments').uncheck();await p.locator('#summary-redlines').uncheck();assert await p.locator('#summary-download').is_disabled()
 await p.locator('#summary-comments').check()
 for c in await p.locator('input[name="column"]').all():await c.uncheck()
 assert await p.locator('#summary-download').is_disabled()
 await p.locator('input[name="column"][value="comment"]').check();assert await p.locator('#summary-download').is_enabled()
 async with p.expect_download() as d:await p.locator('#summary-download').click()
 path=ROOT/'summary-comments-only.docx';await(await d.value).save_as(str(path))
 with zipfile.ZipFile(path) as z:s=z.read('word/document.xml').decode()
 assert '<w:t xml:space="preserve">Comment text</w:t>' in s and 'Please confirm the service scope.' in s
 assert 'forty-five' not in s and '>Action<' not in s
async def chained(p):
 await openfile(p);downloads=[];p.on('download',lambda d:downloads.append(d.suggested_filename));await rename(p,'First Reviewer')
 assert downloads==[]
 path=await summary(p,'summary-current-edit.docx')
 with zipfile.ZipFile(path) as z:s=z.read('word/document.xml').decode()
 assert 'First Reviewer' in s and 'Payment is due in thirty days' in s
 assert len(downloads)==1 and (await info(p))['dirty']
 await rename(p,'Second Reviewer');assert len(downloads)==1
 assert await p.locator('[data-nav-status="download"]').inner_text()=='Changed since download'
 await jump(p,'download')
 async with p.expect_download() as d:await p.locator('#linear-download-document').click()
 path=ROOT/'chained-updated.docx';await(await d.value).save_as(str(path))
 assert not (await info(p))['dirty']
 with zipfile.ZipFile(path) as z:
  for k in ['word/document.xml','word/comments.xml']:assert 'w:author="Second Reviewer"' in z.read(k).decode()
 await rename(p,'Third Reviewer');assert (await info(p))['dirty'];assert len(downloads)==2
async def appendix(p):
 await openfile(p);await rename(p,'Preserved Reviewer')
 await summary(p,'test-combined.docx',True);await jump(p,'download')
 async with p.expect_download() as d:await p.locator('#linear-download-document').click()
 await(await d.value).save_as(str(ROOT/'test-updated.docx'))
 with zipfile.ZipFile(ROOT/'test-combined.docx') as a,zipfile.ZipFile(ROOT/'test-updated.docx') as b:
  aa={n:a.read(n) for n in a.namelist() if not n.endswith('/')};bb={n:b.read(n) for n in b.namelist() if not n.endswith('/')}
 assert set(aa)==set(bb)
 assert [n for n in bb if aa[n]!=bb[n]]==['word/document.xml']
 combined=aa['word/document.xml'].decode();original=bb['word/document.xml'].decode()
 assert re.sub(r'<!-- Comment Master summary begins -->.*?<!-- Comment Master summary ends -->','',combined,flags=re.S)==original
async def bad_appendix(p):
 with zipfile.ZipFile(ROOT/'linear-fixture.docx') as z:parts={n:z.read(n) for n in z.namelist()}
 parts['word/document.xml']=parts['word/document.xml'].replace(b'<w:sectPr ',b'<w:sectPr ',1).replace(b'<w:pgSz ',b'<w:type w:val="continuous"/><w:pgSz ',1)
 path=ROOT/'special-section.docx'
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
  for n,x in parts.items():z.writestr(n,x)
 await openfile(p,path);before=await snap(p);await jump(p,'download');await p.locator('#linear-download-summary').click();await p.locator('#summary-original').check();await p.locator('#summary-download').click();await p.wait_for_timeout(100)
 assert await p.locator('#linear-summary-dialog').is_visible()
 assert 'special section break' in await p.locator('#summary-validation').inner_text()
 assert before==await snap(p)
 await p.locator('#summary-original').uncheck()
 async with p.expect_download():await p.locator('#summary-download').click()
async def reset_same_authors(p):
 await openfile(p);await rename(p)
 p.on('dialog',lambda d:asyncio.create_task(d.accept()))
 await openfile(p)
 assert (await info(p))['activity']=={};assert not(await info(p))['dirty']
 assert await p.locator('#linear-name-from option').count()==4
 assert await p.locator('[data-nav-status="names"]').inner_text()=='Not used'
async def safety_cancel(p):
 await openfile(p);await rename(p);before=await snap(p)
 p.on('dialog',lambda d:asyncio.create_task(d.dismiss()))
 await openfile(p,ROOT/'linear-fixture-base.docx')
 assert await snap(p)==before
async def navigation(p):
 await openfile(p);await rename(p);await jump(p,'review')
 await p.locator('#nav-toggle').click();await p.locator('#current-word-route').click()
 assert await p.locator('#workspace').is_visible()
 assert await p.locator('#tabs').is_visible()
 await p.locator('#nav-toggle').click();await p.locator('#global-navigation [data-route-target="home"]').click()
 assert await p.locator('#data-table').is_visible()
 assert await p.locator('#linear-name-from option').count()==3
 assert (await info(p))['activity']=={'names':1}
async def phone(p):
 await openfile(p);await rename(p)
 assert await p.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1
 await jump(p,'review');await p.locator('#data-table').wait_for(state='visible')
 assert await p.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1
 await jump(p,'download');await p.locator('#linear-download-summary').click()
 assert await p.locator('#summary-download').is_visible()
 assert await p.evaluate('document.documentElement.scrollWidth-document.documentElement.clientWidth')<=1
 w=p.viewport_size['width'];await p.screenshot(path=str(ROOT/f'linear-mobile-{w}.png'),full_page=True)
async def main():
 fixture()
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for name,fn in [('Initial load and real file picker',initial),('Accurate section status and undo',status_undo),('Manual comments and names, multiple open panels',manual),('Timestamp operations and metadata',dates_metadata),('Summary defaults, scope, columns, validation',defaults),('Chained edits, summary, and final download',chained),('Exact source package appendix preservation',appendix),('Special section fails closed without losing work',bad_appendix),('New file resets all progress and author selectors',reset_same_authors),('Replacement cancellation preserves existing work',safety_cancel),('Expert editor navigation retains working copy',navigation)]:
   await test(b,name,fn)
  for w in [390,320]:await test(b,f'Mobile layout and summary dialog {w}px',phone,w)
  await b.close()
 ROOT.joinpath('linear-local-test-results.json').write_text(json.dumps({'harness':'actual Word engine and UI, inlined modules; PDF and service-worker not exercised','results':RESULTS,'passed':sum(r['passed'] for r in RESULTS),'failed':sum(not r['passed'] for r in RESULTS)},indent=2))
 if any(not r['passed'] for r in RESULTS):raise SystemExit(1)
if __name__=='__main__':asyncio.run(main())
