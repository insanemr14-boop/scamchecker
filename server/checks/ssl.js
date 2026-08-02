import tls from 'tls'

export async function checkSSL(domain) {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()

    return new Promise((resolve) => {
      let isSettled = false

      const socket = tls.connect(443, cleanDomain, { servername: cleanDomain, rejectUnauthorized: false }, () => {
        if (isSettled) return
        isSettled = true

        const cert = socket.getPeerCertificate(true)
        const protocol = socket.getProtocol()
        const cipher = socket.getCipher()?.name || 'TLS'
        socket.destroy()

        if (!cert || Object.keys(cert).length === 0) {
          return resolve({
            id: 'ssl',
            name: 'SSL Certificate',
            icon: '🔒',
            color: '#10b981',
            desc: 'Verify SSL/TLS certificate validity',
            status: 'dangerous',
            details: { valid: false, error: 'No SSL certificate served on port 443' },
            links: [
              { label: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${cleanDomain}` }
            ]
          })
        }

        const validFrom = new Date(cert.valid_from)
        const validTo = new Date(cert.valid_to)
        const now = new Date()
        const isValid = now >= validFrom && now <= validTo
        const daysUntilExpiry = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24))
        const issuer = cert.issuer?.O || cert.issuer?.CN || 'Unknown'
        const subject = cert.subject?.CN || cleanDomain

        let status = 'safe'
        if (!isValid) status = 'dangerous'
        else if (daysUntilExpiry < 30) status = 'warning'

        resolve({
          id: 'ssl',
          name: 'SSL Certificate',
          icon: '🔒',
          color: '#10b981',
          desc: 'Verify SSL/TLS certificate validity',
          status,
          details: {
            valid: isValid ? 'Yes (Valid Certificate)' : 'No (Expired or Invalid Certificate)',
            issuedTo: subject,
            issuer,
            validFrom: validFrom.toISOString().split('T')[0],
            validTo: validTo.toISOString().split('T')[0],
            daysUntilExpiry: `${daysUntilExpiry} days remaining`,
            protocol,
            cipher
          },
          links: [
            { label: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${cleanDomain}` },
            { label: 'Crt.sh Certificate Logs', url: `https://crt.sh/?q=${cleanDomain}` }
          ]
        })
      })

      socket.on('error', (err) => {
        if (isSettled) return
        isSettled = true
        resolve({
          id: 'ssl',
          name: 'SSL Certificate',
          icon: '🔒',
          color: '#10b981',
          desc: 'Verify SSL/TLS certificate validity',
          status: 'warning',
          details: `Could not connect to port 443 HTTPS: ${err.message}`,
          links: [
            { label: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${cleanDomain}` }
          ]
        })
      })

      socket.setTimeout(3000, () => {
        if (isSettled) return
        isSettled = true
        socket.destroy()
        resolve({
          id: 'ssl',
          name: 'SSL Certificate',
          icon: '🔒',
          color: '#10b981',
          desc: 'Verify SSL/TLS certificate validity',
          status: 'warning',
          details: 'SSL connection timed out (port 443 not responding)',
          links: [
            { label: 'SSL Labs Test', url: `https://www.ssllabs.com/ssltest/analyze.html?d=${cleanDomain}` }
          ]
        })
      })
    })
  } catch (err) {
    return {
      id: 'ssl',
      name: 'SSL Certificate',
      icon: '🔒',
      color: '#10b981',
      desc: 'Verify SSL/TLS certificate validity',
      status: 'error',
      error: err.message
    }
  }
}