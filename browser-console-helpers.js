// Browser Console Helper Functions for Inspecting RP.GOB.PA Property Modals
// Copy and paste these functions into your browser's console (F12 → Console tab)

// ============================================================================
// 1. COUNT MODALS
// ============================================================================
function countModals() {
  const allModals = document.querySelectorAll('.blazored-modal-container');
  const visibleModals = Array.from(allModals).filter(modal => {
    const style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
  
  console.log('=== MODAL COUNT ===');
  console.log(`Total modals in DOM: ${allModals.length}`);
  console.log(`Visible modals: ${visibleModals.length}`);
  console.log(`Hidden modals: ${allModals.length - visibleModals.length}`);
  
  return {
    total: allModals.length,
    visible: visibleModals.length,
    hidden: allModals.length - visibleModals.length
  };
}

// Usage: countModals()

// ============================================================================
// 2. LIST ALL MODAL TITLES
// ============================================================================
function listModalTitles() {
  const titles = Array.from(document.querySelectorAll('.blazored-modal-title'));
  const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
  
  console.log('=== MODAL TITLES ===');
  titles.forEach((title, idx) => {
    const modal = modals[idx];
    const style = modal ? window.getComputedStyle(modal) : null;
    const isVisible = modal && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    
    const folioMatch = title.textContent.match(/Folio\s+Real\s+N[°º]\s*(\d+)/i);
    const folio = folioMatch ? folioMatch[1] : 'NOT FOUND';
    
    console.log(`Modal ${idx + 1}:`);
    console.log(`  Title: ${title.textContent.substring(0, 80)}...`);
    console.log(`  Folio: ${folio}`);
    console.log(`  Visible: ${isVisible ? 'YES' : 'NO'}`);
    if (modal && style) {
      console.log(`  Display: ${style.display}`);
      console.log(`  Opacity: ${style.opacity}`);
    }
    console.log('');
  });
  
  return titles.map(t => t.textContent);
}

// Usage: listModalTitles()

// ============================================================================
// 3. GET ACTIVE MODAL INFO
// ============================================================================
function getActiveModalInfo() {
  const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
  const visibleModals = modals.filter(modal => {
    const style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
  
  if (visibleModals.length === 0) {
    console.log('❌ No visible modals found');
    return null;
  }
  
  // Get the last visible modal (most recent)
  const activeModal = visibleModals[visibleModals.length - 1];
  const title = activeModal.querySelector('.blazored-modal-title')?.textContent || 'NO TITLE';
  const folioMatch = title.match(/Folio\s+Real\s+N[°º]\s*(\d+)/i);
  const folio = folioMatch ? folioMatch[1] : 'NOT FOUND';
  
  // Get active tab
  const activeTab = activeModal.querySelector('.btn-primary')?.textContent?.trim() || 'NONE';
  
  console.log('=== ACTIVE MODAL INFO ===');
  console.log(`Title: ${title}`);
  console.log(`Folio: ${folio}`);
  console.log(`Active Tab: ${activeTab}`);
  console.log(`Visible Modals Count: ${visibleModals.length}`);
  console.log(`Modal Index: ${modals.indexOf(activeModal) + 1} of ${modals.length}`);
  
  return {
    title,
    folio,
    activeTab,
    modal: activeModal,
    index: modals.indexOf(activeModal)
  };
}

// Usage: getActiveModalInfo()

// ============================================================================
// 4. EXTRACT DATOS GENERALES FROM ACTIVE MODAL
// ============================================================================
function extractDatosGenerales() {
  const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
  const visibleModals = modals.filter(modal => {
    const style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
  
  if (visibleModals.length === 0) {
    console.log('❌ No visible modals found');
    return null;
  }
  
  const activeModal = visibleModals[visibleModals.length - 1];
  const title = activeModal.querySelector('.blazored-modal-title')?.textContent || '';
  const folioMatch = title.match(/Folio\s+Real\s+N[°º]\s*(\d+)/i);
  const folio = folioMatch ? folioMatch[1] : 'NOT FOUND';
  
  // Find tab content
  const tabContent = activeModal.querySelector('.tabestado') || activeModal;
  const dls = tabContent.querySelectorAll('dl.dl-horizontal');
  
  const data = {};
  
  dls.forEach(dl => {
    const dts = dl.querySelectorAll('dt');
    const dds = dl.querySelectorAll('dd');
    
    for (let i = 0; i < dts.length && i < dds.length; i++) {
      const label = dts[i].textContent?.trim() || '';
      const value = dds[i].textContent?.trim() || '';
      data[label] = value;
    }
  });
  
  console.log('=== DATOS GENERALES ===');
  console.log(`Folio: ${folio}`);
  console.log(`Title: ${title.substring(0, 60)}...`);
  console.log('\nData:');
  Object.entries(data).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
  return {
    folio,
    title,
    data
  };
}

// Usage: extractDatosGenerales()

// ============================================================================
// 5. EXTRACT DATA FROM SPECIFIC FOLIO
// ============================================================================
function extractByFolio(folioNumber) {
  const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
  
  // Find modal with matching folio
  const targetModal = modals.find(modal => {
    const title = modal.querySelector('.blazored-modal-title')?.textContent || '';
    return title.includes(folioNumber);
  });
  
  if (!targetModal) {
    console.log(`❌ No modal found for folio ${folioNumber}`);
    return null;
  }
  
  const style = window.getComputedStyle(targetModal);
  const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  
  console.log(`=== FOLIO ${folioNumber} ===`);
  console.log(`Visible: ${isVisible ? 'YES' : 'NO'}`);
  console.log(`Display: ${style.display}`);
  console.log(`Opacity: ${style.opacity}`);
  
  // Extract data
  const tabContent = targetModal.querySelector('.tabestado') || targetModal;
  const dls = tabContent.querySelectorAll('dl.dl-horizontal');
  
  const data = {};
  dls.forEach(dl => {
    const dts = dl.querySelectorAll('dt');
    const dds = dl.querySelectorAll('dd');
    for (let i = 0; i < dts.length && i < dds.length; i++) {
      const label = dts[i].textContent?.trim() || '';
      const value = dds[i].textContent?.trim() || '';
      data[label] = value;
    }
  });
  
  console.log('\nData:');
  Object.entries(data).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  
  return {
    folio: folioNumber,
    modal: targetModal,
    isVisible,
    data
  };
}

// Usage: extractByFolio('30164310')

// ============================================================================
// 6. GET ALL TABS FOR ACTIVE MODAL
// ============================================================================
function getAvailableTabs() {
  const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
  const visibleModals = modals.filter(modal => {
    const style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
  
  if (visibleModals.length === 0) {
    console.log('❌ No visible modals found');
    return [];
  }
  
  const activeModal = visibleModals[visibleModals.length - 1];
  const tabControl = activeModal.querySelector('.ventana-con-tab-control');
  const btnGroup = tabControl ? tabControl.querySelector('.btn-group[role="group"]') : 
                  activeModal.querySelector('.btn-group[role="group"]');
  
  if (!btnGroup) {
    console.log('❌ No tab button group found');
    return [];
  }
  
  const buttons = Array.from(btnGroup.querySelectorAll('button'));
  const tabs = buttons.map(btn => {
    const text = btn.textContent?.trim() || '';
    const isActive = btn.classList.contains('btn-primary');
    return {
      name: text,
      isActive: isActive,
      element: btn
    };
  });
  
  console.log('=== AVAILABLE TABS ===');
  tabs.forEach(tab => {
    console.log(`${tab.isActive ? '✓' : ' '} ${tab.name} ${tab.isActive ? '(ACTIVE)' : ''}`);
  });
  
  return tabs;
}

// Usage: getAvailableTabs()

// ============================================================================
// 7. EXTRACT TABLE DATA FROM ACTIVE TAB
// ============================================================================
function extractTableData(tabName) {
  const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
  const visibleModals = modals.filter(modal => {
    const style = window.getComputedStyle(modal);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  });
  
  if (visibleModals.length === 0) {
    console.log('❌ No visible modals found');
    return [];
  }
  
  const activeModal = visibleModals[visibleModals.length - 1];
  const tabContent = activeModal.querySelector('.tabestado') || activeModal;
  const tables = tabContent.querySelectorAll('table');
  
  console.log(`=== TABLE DATA (${tabName || 'Current Tab'}) ===`);
  console.log(`Tables found: ${tables.length}`);
  
  if (tables.length === 0) {
    console.log('❌ No tables found in current tab');
    return [];
  }
  
  const allRows = [];
  
  tables.forEach((table, tableIdx) => {
    const thead = table.querySelector('thead');
    const headers = thead ? Array.from(thead.querySelectorAll('th')).map(th => th.textContent?.trim()) : [];
    
    const tbody = table.querySelector('tbody');
    const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : Array.from(table.querySelectorAll('tr'));
    
    console.log(`\nTable ${tableIdx + 1}:`);
    console.log(`  Headers: ${headers.join(', ')}`);
    console.log(`  Rows: ${rows.length}`);
    
    rows.forEach((row, rowIdx) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const rowData = {};
      
      cells.forEach((cell, cellIdx) => {
        const header = headers[cellIdx] || `Column${cellIdx + 1}`;
        rowData[header] = cell.textContent?.trim() || '';
      });
      
      if (Object.values(rowData).some(v => v)) {
        allRows.push(rowData);
        console.log(`  Row ${rowIdx + 1}:`, rowData);
      }
    });
  });
  
  return allRows;
}

// Usage: extractTableData('Folios Madre')

// ============================================================================
// 8. COMPARE PROPERTY 1 VS PROPERTY 2
// ============================================================================
function compareProperties(folio1, folio2) {
  console.log('=== COMPARING PROPERTIES ===');
  
  const prop1 = extractByFolio(folio1);
  const prop2 = extractByFolio(folio2);
  
  if (!prop1 || !prop2) {
    console.log('❌ Could not find one or both properties');
    return null;
  }
  
  console.log(`\nProperty 1 (${folio1}):`);
  console.log(`  Visible: ${prop1.isVisible}`);
  console.log(`  Owner: ${prop1.data['PROPIETARIO'] || 'NOT FOUND'}`);
  console.log(`  Value: ${prop1.data['VALOR'] || 'NOT FOUND'}`);
  
  console.log(`\nProperty 2 (${folio2}):`);
  console.log(`  Visible: ${prop2.isVisible}`);
  console.log(`  Owner: ${prop2.data['PROPIETARIO'] || 'NOT FOUND'}`);
  console.log(`  Value: ${prop2.data['VALOR'] || 'NOT FOUND'}`);
  
  // Compare data keys
  const keys1 = Object.keys(prop1.data);
  const keys2 = Object.keys(prop2.data);
  const missingIn2 = keys1.filter(k => !keys2.includes(k));
  const missingIn1 = keys2.filter(k => !keys1.includes(k));
  
  if (missingIn2.length > 0) {
    console.log(`\n⚠️ Keys missing in Property 2: ${missingIn2.join(', ')}`);
  }
  if (missingIn1.length > 0) {
    console.log(`⚠️ Keys missing in Property 1: ${missingIn1.join(', ')}`);
  }
  
  return {
    property1: prop1,
    property2: prop2,
    differences: {
      missingIn2,
      missingIn1
    }
  };
}

// Usage: compareProperties('30164308', '30164310')

// ============================================================================
// 9. GET MODAL STACK INFO
// ============================================================================
function getModalStack() {
  const modals = Array.from(document.querySelectorAll('.blazored-modal-container'));
  
  console.log('=== MODAL STACK ===');
  console.log(`Total modals: ${modals.length}\n`);
  
  modals.forEach((modal, idx) => {
    const style = window.getComputedStyle(modal);
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    const title = modal.querySelector('.blazored-modal-title')?.textContent || 'NO TITLE';
    const folioMatch = title.match(/Folio\s+Real\s+N[°º]\s*(\d+)/i);
    const folio = folioMatch ? folioMatch[1] : 'NOT FOUND';
    
    console.log(`Modal ${idx + 1} (${isVisible ? 'VISIBLE' : 'HIDDEN'}):`);
    console.log(`  Folio: ${folio}`);
    console.log(`  Title: ${title.substring(0, 60)}...`);
    console.log(`  Display: ${style.display}`);
    console.log(`  Opacity: ${style.opacity}`);
    console.log(`  Z-index: ${style.zIndex}`);
    console.log(`  Position: ${style.position}`);
    console.log('');
  });
  
  return modals.map((modal, idx) => {
    const style = window.getComputedStyle(modal);
    return {
      index: idx,
      isVisible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
      title: modal.querySelector('.blazored-modal-title')?.textContent || '',
      style: {
        display: style.display,
        opacity: style.opacity,
        zIndex: style.zIndex
      }
    };
  });
}

// Usage: getModalStack()

// ============================================================================
// 10. QUICK CHECK - IS PROPERTY 2 DATA AVAILABLE?
// ============================================================================
function checkProperty2() {
  console.log('=== CHECKING PROPERTY 2 (30164310) ===');
  
  const result = extractByFolio('30164310');
  
  if (!result) {
    console.log('❌ Property 2 modal not found in DOM');
    return false;
  }
  
  if (!result.isVisible) {
    console.log('⚠️ Property 2 modal exists but is HIDDEN');
    console.log(`   Display: ${window.getComputedStyle(result.modal).display}`);
    return false;
  }
  
  if (!result.data || Object.keys(result.data).length === 0) {
    console.log('⚠️ Property 2 modal is visible but has NO DATA');
    return false;
  }
  
  const owner = result.data['PROPIETARIO'] || '';
  const value = result.data['VALOR'] || '';
  
  if (!owner || !value) {
    console.log('⚠️ Property 2 data is incomplete:');
    console.log(`   Owner: ${owner || 'MISSING'}`);
    console.log(`   Value: ${value || 'MISSING'}`);
    return false;
  }
  
  console.log('✅ Property 2 data is available:');
  console.log(`   Owner: ${owner}`);
  console.log(`   Value: ${value}`);
  
  return true;
}

// Usage: checkProperty2()

// ============================================================================
// QUICK START - RUN ALL CHECKS
// ============================================================================
function runAllChecks() {
  console.log('🔍 RUNNING ALL CHECKS...\n');
  countModals();
  console.log('');
  listModalTitles();
  console.log('');
  getActiveModalInfo();
  console.log('');
  extractDatosGenerales();
  console.log('');
  checkProperty2();
  console.log('');
  getModalStack();
}

// Usage: runAllChecks()

// ============================================================================
// END OF HELPER FUNCTIONS
// ============================================================================

console.log('✅ Browser Console Helpers Loaded!');
console.log('Available functions:');
console.log('  - countModals()');
console.log('  - listModalTitles()');
console.log('  - getActiveModalInfo()');
console.log('  - extractDatosGenerales()');
console.log('  - extractByFolio(folioNumber)');
console.log('  - getAvailableTabs()');
console.log('  - extractTableData(tabName)');
console.log('  - compareProperties(folio1, folio2)');
console.log('  - getModalStack()');
console.log('  - checkProperty2()');
console.log('  - runAllChecks()');
console.log('\nExample: runAllChecks()');

