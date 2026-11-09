import asyncio, json, zipfile, os, tempfile
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from lxml import etree
ROOT=Path(os.environ.get('CM_LOCAL_OUTPUT', str(Path(tempfile.gettempdir())/'comment-master-local-qa')));ROOT.mkdir(parents=True,exist_ok=True)
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/package/2006/relationships'
def fixture():
 d=Document();d.sections[0].header.paragraphs[0].text='SOURCE HEADER: Confidential review'
 d.sections[0].footer.paragraphs[0].text='SOURCE FOOTER'
 d.add_heading('Annual Service Agreement',0)
 p=d.add_paragraph('The provider will supply ')
 a=OxmlElement('w:commentRangeStart');a.set(qn('w:id'),'0');p._p.append(a)
 p.add_run('qualified consulting services.').bold=True
 a=OxmlElement('w:commentRangeEnd');a.set(qn('w:id'),'0');p._p.append(a)
 r=OxmlElement('w:r');a=OxmlElement('w:commentReference');a.set(qn('w:id'),'0');r.append(a);p._p.append(r)
 p=d.add_paragraph('Payment is due in ')
 for kind,text,author,id in [('del','thirty','Alex Smith','1'),('ins','forty-five','Jordan Lee','2')]:
  e=OxmlElement('w:'+kind);e.set(qn('w:id'),id);e.set(qn('w:author'),author);e.set(qn('w:date'),'2026-10-12T12:30:00Z')
  r=OxmlElement('w:r');t=OxmlElement('w:delText' if kind=='del' else 'w:t');t.text=text;r.append(t);e.append(r);p._p.append(e)
 p.add_run(' days after the invoice date.')
 d.add_paragraph('The provisions below are original document content. They must remain intact.')
 table=d.add_table(rows=2,cols=2);table.style='Table Grid';table.cell(0,0).text='Service';table.cell(0,1).text='Fee';table.cell(1,0).text='Consultation';table.cell(1,1).text='$500'
 d.add_page_break();d.add_heading('Appendix A',1);d.add_paragraph('Second original page. End of source document.')
 d.core_properties.author='Original Creator';d.core_properties.last_modified_by='Original Editor'
 d.save(ROOT/'linear-fixture-base.docx')
 with zipfile.ZipFile(ROOT/'linear-fixture-base.docx') as z: parts={n:z.read(n) for n in z.namelist()}
 ct=etree.fromstring(parts['[Content_Types].xml']);e=etree.SubElement(ct,'{http://schemas.openxmlformats.org/package/2006/content-types}Override',PartName='/word/comments.xml',ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml');parts['[Content_Types].xml']=etree.tostring(ct,xml_declaration=True,encoding='UTF-8')
 rel=etree.fromstring(parts['word/_rels/document.xml.rels']);etree.SubElement(rel,'{'+R+'}Relationship',Id='rIdCommentTest',Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',Target='comments.xml');parts['word/_rels/document.xml.rels']=etree.tostring(rel,xml_declaration=True,encoding='UTF-8')
 parts['word/comments.xml']=f'''<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="{W}"><w:comment w:id="0" w:author="Alex Smith" w:initials="AS" w:date="2026-10-12T12:00:00Z"><w:p><w:r><w:t>Please confirm the service scope.</w:t></w:r></w:p></w:comment></w:comments>'''.encode()
 with zipfile.ZipFile(ROOT/'linear-fixture.docx','w',zipfile.ZIP_DEFLATED) as z:
  for n,b in parts.items():z.writestr(n,b)
