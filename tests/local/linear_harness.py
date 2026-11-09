import re, os
from pathlib import Path
ROOT=Path(os.environ.get('COMMENT_MASTER_ROOT', str(Path(__file__).resolve().parents[2])))
async def load_local(page):
 # Local, non-network harness. Source Word engine and UI are unchanged. The PDF
 # imports are not initialized here; production-module, PDF, and service-worker QA must run separately.
 html=(ROOT/'index.html').read_text()
 html=re.sub(r'<link\b[^>]*>','',html)
 html=re.sub(r'<script type="module"[^>]*>\s*</script>','',html)
 await page.set_content(html,wait_until='load')
 for name in ['workbench.css','linear-workspace.css']:
  await page.add_style_tag(content=(ROOT/'src'/name).read_text())
 core=(ROOT/'src/workbench-core.mjs').read_text();exports=re.findall(r'export (?:async )?(?:function|const) (\w+)',core)
 core=re.sub(r'\bexport\s+','',core)
 await page.add_script_tag(content='window.CMCore=(()=>{'+core+';return {'+','.join(exports)+'};})();')
 review=(ROOT/'src/review-summary.mjs').read_text();exports=re.findall(r'export (?:async )?(?:function|const) (\w+)',review)
 review=re.sub(r'\bexport\s+','',review)
 await page.add_script_tag(content='window.CMReport=(()=>{'+review+';return {'+','.join(exports)+'};})();')
 linear=(ROOT/'src/linear-workspace.mjs').read_text();linear=re.sub(r"^import [^;]+;\s*",'',linear,flags=re.M);linear=re.sub(r'\bexport\s+','',linear)
 await page.add_script_tag(content='window.CMLinearModule=(()=>{const {SUMMARY_COLUMNS,buildReviewSummary,summaryRows}=window.CMReport;'+linear+';return {initLinearWorkspace};})();')
 wb=(ROOT/'src/workbench.js').read_text();wb=re.sub(r'^import [\s\S]*?;\s*','',wb,flags=re.M)
 wb=wb.replace('import.meta.url',"'https://local.test/assets/workbench.js'")
 # This branch tests only Word behavior and layout, with no networking.
 wb=wb.replace('  registerServiceWorker();','  /* service-worker is outside this local harness */')
 pre='const {initLinearWorkspace}=window.CMLinearModule;const {WORKBENCH_VERSION,assertSafeFiles,contextualSuggestions,detectFormat,escapeHtml,extensionOf,formatLabel,humanBytes,parsePageRanges,productFilename,safeFilename,yieldToMain}=window.CMCore;const pdfjsLib={GlobalWorkerOptions:{}};'
 await page.add_script_tag(content='(()=>{'+pre+wb+'})();')
 await page.wait_for_function('() => !!window.CommentMasterLinear')
 await page.evaluate("document.body.dataset.route='home'")
