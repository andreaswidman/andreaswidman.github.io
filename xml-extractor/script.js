document.getElementById('extractBtn').addEventListener('click', function() {
    // Scoped and strict search inside the repeating node
    function extractValue(el, attr) {
        console.log(`\n[DEBUG] Checking inside repeating node for attribute/tag: ${attr}`);

        // Check if repeating node itself has the attribute
        if (el.hasAttribute(attr)) {
            console.log(`[DEBUG] Found attribute '${attr}' on repeating node itself: ${el.getAttribute(attr)}`);
            return el.getAttribute(attr);
        }

        // Check if any descendant has attribute-id="attr"
        const customAttr = el.querySelector(`*[attribute-id="${attr}"]`);
        if (customAttr && customAttr.textContent.trim()) {
            console.log(`[DEBUG] Found descendant with attribute-id='${attr}': ${customAttr.textContent.trim()}`);
            return customAttr.textContent.trim();
        }

        // Check if any descendant has tag name 'attr'
        const node = el.querySelector(attr);
        if (node && node.textContent.trim()) {
            console.log(`[DEBUG] Found node '${attr}' inside repeating node: ${node.textContent.trim()}`);
            return node.textContent.trim();
        }

        // Check if any descendant has attribute 'attr'
        const attrNode = el.querySelector(`[${CSS.escape(attr)}]`);
        if (attrNode) {
            console.log(`[DEBUG] Found attribute '${attr}' inside repeating node on node '${attrNode.tagName}': ${attrNode.getAttribute(attr)}`);
            return attrNode.getAttribute(attr);
        }

        console.log(`[DEBUG] No match found for '${attr}' inside this repeating node.`);
        return '';
    }

    const fileInput = document.getElementById('xmlFile');
    const repeatingNode = document.getElementById('repeatingNode').value.trim();
    const attributeName = document.getElementById('attributeName').value.trim();
    const resultContainer = document.getElementById('result');

    if (!fileInput.files[0] || !attributeName || !repeatingNode) {
        alert('Please upload an XML file, specify attributes/nodes, and the repeating node.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "application/xml");

        const attributeNames = attributeName.split(',').map(a => a.trim());
        let rows = [];

        xmlDoc.querySelectorAll(repeatingNode).forEach((el, index) => {
            console.log(`\n[DEBUG] Processing repeating node #${index + 1}`);
            let row = attributeNames.map(attr => extractValue(el, attr));
            rows.push(row);
        });

        if (rows.length === 0) {
            resultContainer.innerHTML = `<div class="result-header">No matches found for "<strong>${attributeName}</strong>" in node "<strong>${repeatingNode}</strong>".</div>`;
        } else {
            resultContainer.innerHTML = `
                <div class="result-header">Repeating Node: "<strong>${repeatingNode}</strong>" | Attributes/Nodes: "<strong>${attributeName}</strong>" | Results: ${rows.length}</div>
                <button id="downloadCSVBtn" style="margin-bottom: 10px; background-color: #eeeeee; color: #333; border: 1px solid #ccc; padding: 8px 12px; cursor: pointer;">Download as CSV</button>
                <table class="result-table">
                    <thead>
                        <tr>${attributeNames.map(attr => `<th>${attr}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `<tr>${row.map(col => `<td>${col}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                </table>
            `;
            document.getElementById('downloadCSVBtn').addEventListener('click', function() {
                let csvContent = attributeNames.join(',') + "\n" +
                    rows.map(e => e.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join("\n");

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", "extracted_data.csv");
                link.style.display = "none";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }
    };

    reader.readAsText(fileInput.files[0]);
});